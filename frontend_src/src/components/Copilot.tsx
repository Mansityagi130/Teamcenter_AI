import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import apiClient from '../api';
import {
  RootState,
  addMessage,
  updateLastAssistantMessage,
  setMessages,
  addTerminalLog,
  setRunningTool,
  setAttachedFile,
  setActiveSessionId,
  setSessions,
  addToast,
} from '../store';

// Helper to parse markdown using global markdown-it library
function getMarkdownHtml(text: string): string {
  const win = window as any;
  if (win.markdownit) {
    try {
      const md = win.markdownit({
        html: false,
        linkify: true,
        breaks: true,
      });
      return md.render(text);
    } catch (e) {
      console.error('Failed to parse markdown-it:', e);
    }
  }
  // Simple fallback
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n- (.*)/g, '<br>• $1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function Copilot() {
  const dispatch = useDispatch();
  
  // Redux Selectors
  const messages = useSelector((state: RootState) => state.chats.messages);
  const activeSessionId = useSelector((state: RootState) => state.chats.activeSessionId);
  const terminalLogs = useSelector((state: RootState) => state.chats.terminalLogs);
  const activeRunningTool = useSelector((state: RootState) => state.chats.activeRunningTool);
  const attachedFile = useSelector((state: RootState) => state.chats.attachedFile);
  const activeModel = useSelector((state: RootState) => state.settings.activeModel);
  const activeEnv = useSelector((state: RootState) => state.settings.activeEnv);

  // Local state
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat feed
  useEffect(() => {
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load active session messages
  async function loadActiveSessionMessages() {
    if (!activeSessionId) return;
    try {
      const res = await apiClient.get(`/chat/history?session_id=${encodeURIComponent(activeSessionId)}`);
      dispatch(setMessages(res.data));
    } catch (err: any) {
      dispatch(addToast({ message: 'Failed to load chat history', type: 'error' }));
    }
  }

  useEffect(() => {
    loadActiveSessionMessages();
  }, [activeSessionId]);

  // Handle Suggested prompts
  function handleSuggestedPrompt(promptText: string) {
    setInputText(promptText);
    sendMessage(promptText);
  }

  // Handle Send Message
  async function sendMessage(textToSend: string) {
    const text = textToSend.trim();
    if (!text) return;

    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Determine session ID
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
      dispatch(setActiveSessionId(currentSessionId));
    }

    // Add user message to Redux
    const tempUserMsgId = Date.now();
    dispatch(addMessage({
      id: tempUserMsgId,
      sender: 'user',
      message: text,
      timestamp: new Date().toLocaleTimeString(),
    }));

    // Add running tool state logging
    let detectedKeyword = 'chat_message';
    if (text.toLowerCase().includes('bom') || text.toLowerCase().includes('materials')) {
      detectedKeyword = 'bom_structure_query';
    } else if (text.toLowerCase().includes('dataset')) {
      detectedKeyword = 'dataset_list_query';
    } else if (text.toLowerCase().includes('revision')) {
      detectedKeyword = 'revision_history_query';
    }

    dispatch(setRunningTool({
      name: detectedKeyword.toUpperCase(),
      time: new Date().toTimeString().split(' ')[0],
      params: JSON.stringify({ query: text.substring(0, 30), session_id: currentSessionId }),
      active: true,
    }));

    dispatch(addTerminalLog({
      action: detectedKeyword,
      payload: { query: text, session_id: currentSessionId }
    }));

    // Add placeholder assistant message
    const tempAssistantMsgId = tempUserMsgId + 1;
    dispatch(addMessage({
      id: tempAssistantMsgId,
      sender: 'assistant',
      message: 'Analyzing PLM data...',
      timestamp: new Date().toLocaleTimeString(),
      isStreaming: true,
    }));

    try {
      const res = await apiClient.post('/api/chat', {
        message: text,
        model: activeModel,
        environment: activeEnv,
        sessionId: currentSessionId
      });

      // Clear running tool state
      dispatch(setRunningTool({ name: '', time: '', params: '', active: false }));

      // Typewriter/Streaming effect for response
      const reply = res.data.reply;
      let currentLength = 0;
      const interval = setInterval(() => {
        currentLength += Math.min(5, reply.length - currentLength);
        dispatch(updateLastAssistantMessage({
          message: reply.substring(0, currentLength),
          isStreaming: currentLength < reply.length,
        }));
        if (currentLength >= reply.length) {
          clearInterval(interval);
          // Reload sessions list in sidebar to capture any new sessions
          apiClient.get('/chat/sessions').then((sRes) => {
            dispatch(setSessions(sRes.data));
          });
        }
      }, 15);

      dispatch(addTerminalLog({
        action: detectedKeyword + '_success',
        payload: { toolCallsCount: res.data.toolCalls?.length || 0 }
      }));
    } catch (err: any) {
      dispatch(setRunningTool({ name: '', time: '', params: '', active: false }));
      dispatch(updateLastAssistantMessage({
        message: `Error executing command: ${err.message}`,
        isStreaming: false,
      }));
      dispatch(addTerminalLog({
        action: detectedKeyword + '_failed',
        payload: { error: err.message }
      }));
    }
  }

  // Handle Edit User Message
  async function handleEditSave(messageId: number) {
    if (!editText.trim()) return;
    setEditingMessageId(null);

    dispatch(addTerminalLog({
      action: 'chat_message_edit',
      payload: { message_id: messageId }
    }));

    // Show temporary typing status
    dispatch(addMessage({
      id: Date.now(),
      sender: 'assistant',
      message: 'Regenerating response...',
      timestamp: new Date().toLocaleTimeString(),
      isStreaming: true,
    }));

    try {
      await apiClient.post('/chat/message/edit', {
        message_id: messageId,
        message: editText
      });
      loadActiveSessionMessages();
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to edit message', type: 'error' }));
      loadActiveSessionMessages();
    }
  }

  // Handle Regenerate Message
  async function handleRegenerate(messageId: number) {
    // Find preceding user message query
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    let userQuery = '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        userQuery = messages[i].message;
        break;
      }
    }

    if (!userQuery) return;

    dispatch(addTerminalLog({
      action: 'chat_message_regenerate',
      payload: { prev_message_id: messageId }
    }));

    // Delete message history locally from index onwards
    const messagesToKeep = messages.slice(0, messageIndex);
    dispatch(setMessages(messagesToKeep));

    // Show temporary typing status
    dispatch(addMessage({
      id: Date.now(),
      sender: 'assistant',
      message: 'Regenerating response...',
      timestamp: new Date().toLocaleTimeString(),
      isStreaming: true,
    }));

    try {
      await apiClient.post('/api/chat', {
        message: userQuery,
        model: activeModel,
        environment: activeEnv,
        sessionId: activeSessionId
      });
      loadActiveSessionMessages();
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to regenerate response', type: 'error' }));
      loadActiveSessionMessages();
    }
  }

  // Speech Recognition dictation
  function toggleListening() {
    const win = window as any;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      dispatch(addToast({ message: 'Speech recognition is not supported in this browser.', type: 'error' }));
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    if (isListening) {
      rec.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      dispatch(addTerminalLog({ action: 'voice_input_started', payload: {} }));
      
      rec.onstart = () => {
        dispatch(addToast({ message: 'Listening... Speak now', type: 'info' }));
      };
      
      rec.onresult = (e: any) => {
        if (e.results.length > 0) {
          const transcript = e.results[0][0].transcript;
          setInputText(transcript);
          dispatch(addTerminalLog({ action: 'voice_input_result', payload: { length: transcript.length } }));
          sendMessage(transcript);
        }
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.start();
    }
  }

  // Attachment upload triggers
  function triggerFileUpload() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    dispatch(setAttachedFile({ name: file.name, size: file.size }));
    dispatch(addTerminalLog({
      action: 'file_attach_select',
      payload: { filename: file.name, size: file.size }
    }));
    dispatch(addToast({ message: `Attached file: ${file.name}`, type: 'success' }));
  }

  function removeAttachedFile() {
    dispatch(setAttachedFile(null));
    if (fileInputRef.current) fileInputRef.current.value = '';
    dispatch(addTerminalLog({ action: 'file_attach_removed', payload: {} }));
  }

  function copyToClipboard(text: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      dispatch(addToast({ message: 'Copied to clipboard', type: 'success' }));
    });
  }

  return (
    <div className="absolute inset-0 flex w-full h-full bg-background">
      {/* Center Panel: AI Chat */}
      <section className="flex-1 flex flex-col relative bg-surface-container-lowest h-full overflow-hidden border-r border-outline-variant/10">
        {/* Chat Feed */}
        <div ref={feedScrollRef} className="flex-1 overflow-y-auto p-gutter pb-40 space-y-md terminal-scroll">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            
            {messages.length === 0 && (
              <div className="text-center py-10 space-y-4 max-w-lg mx-auto" id="chat-welcome-container">
                <div className="w-12 h-12 bg-secondary-container/10 border border-secondary-fixed-dim/30 rounded-full flex items-center justify-center mx-auto text-secondary-fixed-dim">
                  <span className="material-symbols-outlined text-2xl animate-pulse">smart_toy</span>
                </div>
                <h3 className="text-lg font-bold text-on-surface">Welcome to Teamcenter AI</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Please tell me what you would like to do. Ask me about Item IDs, Item Names, BOMs, datasets, workflows, revisions, or general programming.
                </p>
                
                {/* Suggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4 text-xs font-semibold">
                  <button type="button" className="prompt-tag p-2.5 rounded-lg text-left" onClick={() => handleSuggestedPrompt('Fetch the Bill of Materials for Item ID: 4920-X1')}>
                    "Fetch BOM for 4920-X1"
                  </button>
                  <button type="button" className="prompt-tag p-2.5 rounded-lg text-left" onClick={() => handleSuggestedPrompt('List all datasets associated with Item ID: 4920-X1')}>
                    "List datasets for 4920-X1"
                  </button>
                  <button type="button" className="prompt-tag p-2.5 rounded-lg text-left" onClick={() => handleSuggestedPrompt('Search item names for Bearing')}>
                    "Search for bearings"
                  </button>
                  <button type="button" className="prompt-tag p-2.5 rounded-lg text-left" onClick={() => handleSuggestedPrompt('What is the revision history of Item ID: 4920-X1?')}>
                    "Revision history for 4920-X1"
                  </button>
                </div>
              </div>
            )}

            {/* Render messages */}
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`message flex gap-4 max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    isUser ? 'self-end flex-row-reverse' : 'self-start'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 shadow ${
                      isUser
                        ? 'bg-surface-variant border border-outline-variant/30 text-on-surface'
                        : 'bg-gradient-to-br from-secondary-fixed-dim to-primary-container text-white'
                    }`}
                  >
                    {isUser ? 'U' : 'AI'}
                  </div>

                  <div
                    className={`p-3.5 rounded-xl text-sm leading-relaxed shadow border relative ${
                      isUser
                        ? 'bg-secondary-fixed-dim text-primary-container border-secondary-fixed-dim/20 rounded-tr-none'
                        : 'glass-panel text-on-surface border-outline-variant/10 rounded-tl-none ai-glow'
                    }`}
                  >
                    {editingMessageId === msg.id ? (
                      <div className="space-y-2 p-2 bg-black/20 rounded-lg min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-background border border-outline-variant/30 text-xs rounded p-2 text-on-surface focus:border-secondary-fixed-dim outline-none"
                        />
                        <div className="flex justify-end gap-2 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-2 py-1 bg-surface-variant hover:bg-outline-variant/30 text-on-surface rounded"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSave(msg.id)}
                            className="px-2 py-1 bg-secondary-fixed-dim text-primary-container rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: getMarkdownHtml(msg.message) }}
                        onClick={() => {
                          if (isUser) {
                            setEditingMessageId(msg.id);
                            setEditText(msg.message);
                          }
                        }}
                      />
                    )}

                    {!isUser && !msg.isStreaming && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline-variant/5 text-[10px] text-on-surface-variant font-bold">
                        <button
                          type="button"
                          onClick={(e) => copyToClipboard(msg.message, e)}
                          className="hover:text-secondary-fixed-dim flex items-center gap-1 transition-colors outline-none"
                        >
                          <span className="material-symbols-outlined text-xs">content_copy</span> Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(msg.id)}
                          className="hover:text-secondary-fixed-dim flex items-center gap-1 transition-colors outline-none"
                        >
                          <span className="material-symbols-outlined text-xs">refresh</span> Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-gutter bg-gradient-to-t from-background via-background to-transparent pt-10">
          <div className="max-w-3xl mx-auto glass-panel p-2 rounded-xl flex flex-col gap-2 shadow-2xl ai-glow">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(inputText);
              }}
              className="flex flex-col w-full"
            >
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputText);
                  }
                }}
                rows={1}
                placeholder="Ask Teamcenter AI about Item IDs, Item Names, BOMs, datasets, workflows, revisions..."
                className="w-full bg-transparent border-none focus:ring-0 text-on-surface text-sm p-2 resize-none h-14 placeholder:text-on-surface-variant/40 outline-none"
              />

              <div className="flex items-center justify-between px-2 pt-1 border-t border-outline-variant/10 mt-1">
                {/* Left controls */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-surface-variant/50 text-on-surface-variant transition-colors group outline-none"
                  >
                    <span className="material-symbols-outlined text-lg">attach_file</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Upload Files</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-surface-variant/50 transition-colors outline-none ${
                      isListening ? 'bg-error-container/30 text-error' : 'text-on-surface-variant'
                    }`}
                    title="Dictate Message (Hands-free)"
                  >
                    <span className="material-symbols-outlined text-lg">mic</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Voice</span>
                  </button>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear the screen feed?')) {
                        dispatch(setMessages([]));
                      }
                    }}
                    className="text-xs text-on-surface-variant hover:text-on-surface hover:underline px-2 py-1 outline-none"
                  >
                    Clear Chat
                  </button>
                  <button
                    type="submit"
                    className="bg-secondary-fixed-dim text-primary-container px-4 py-2 rounded-lg flex items-center gap-1.5 font-bold active:scale-95 transition-all shadow-lg hover:shadow-secondary-fixed-dim/20 text-xs outline-none"
                  >
                    <span>Execute</span>
                    <span className="material-symbols-outlined text-sm">send</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {attachedFile && (
            <div className="max-w-3xl mx-auto mt-2 px-3 py-1.5 bg-secondary-container/10 border border-secondary-fixed-dim/20 rounded-lg flex items-center justify-between text-xs text-secondary-fixed-dim">
              <span>{attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              <button type="button" onClick={removeAttachedFile} className="hover:text-error text-sm font-bold">✕</button>
            </div>
          )}
        </div>
      </section>

      {/* Right Panel: Execution Console & CAD Assembly View */}
      <aside className="w-[320px] bg-surface-container flex flex-col overflow-hidden h-full flex-shrink-0 hidden xl:flex">
        <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">System Execution Logs</h3>
          <span className="flex h-2 w-2 rounded-full bg-tertiary animate-pulse"></span>
        </div>

        {/* Log feed */}
        <div className="flex-1 bg-black/30 p-4 font-mono text-[11px] terminal-scroll overflow-y-auto space-y-4">
          
          {terminalLogs.map((log) => (
            <div key={log.id} className="space-y-1 mt-2 border-l-2 border-outline-variant/30 pl-2 animate-in fade-in slide-in-from-left-2 duration-300">
              <p className="text-secondary-fixed-dim">[{log.time}] ACTION: {log.action}</p>
              <div className="ml-2 p-1.5 bg-white/5 border-l border-secondary-fixed-dim/20 rounded">
                <p className="text-[9px] text-on-surface-variant">{log.payload}</p>
              </div>
            </div>
          ))}

          {/* Active Running Tool */}
          {activeRunningTool.active && (
            <div className="space-y-1">
              <p className="text-secondary-fixed-dim flex items-center gap-1">
                <span className="animate-pulse-cyan text-xs">●</span>
                [{activeRunningTool.time}] EXECUTING_TOOL: {activeRunningTool.name}
              </p>
              <div className="ml-3 p-2 bg-white/5 border-l-2 border-secondary-fixed-dim rounded-r">
                <p className="text-[9px] text-on-surface-variant italic">Parameters:</p>
                <p className="text-secondary-fixed-dim font-mono text-[10px]">{activeRunningTool.params}</p>
              </div>
              <div className="ml-3 h-1 w-full bg-surface-variant rounded-full overflow-hidden">
                <div className="h-full bg-secondary-fixed-dim w-1/3 animate-pulse"></div>
              </div>
            </div>
          )}

          {/* Assembly Visualizer */}
          <div className="mt-6 pt-4 border-t border-outline-variant/10">
            <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">CAD Assembly Visualizer</p>
            <div className="aspect-square w-full rounded-xl overflow-hidden glass-panel relative group assembly-glow border border-outline-variant/20">
              <img
                alt="Mechanical Turbine Assembly CAD view"
                className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMVyLhQgk3uOtyUbbteNwGMlgwgiTQ9uilUMdwsBcceJyWISqYJuhpxfdkoHNoOJ_cgjzty0mQibXJFMb0gIgSuq4393K18kJXZ3Zbm91XYaLpCBUemijXIyjCrxoZcZTp4n5X-WOHo5gSSdbAf9LUQoWbCe4DbkXezyTPJRUTKvOCicSLx_QY4IUxMgH41PYhPO8IA1XKjzXFi-xWNoBS3-SZVtEJww8CkDfdPfmkz7Vtwlb-iEuYOsd-Dt4VfrVFKbOeyjychaA"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-3">
                <span className="text-xs font-bold text-secondary-fixed-dim">TURBINE_ASSEMBLY.jt</span>
                <span className="text-[9px] text-on-surface-variant">Hover to preview assembly structure</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 bg-surface-container-high border-t border-outline-variant/10 text-[10px] text-on-surface-variant flex items-center justify-between font-mono">
          <span>Token Audit Target: active</span>
          <span className="text-tertiary font-bold">Safe Mode Active</span>
        </div>
      </aside>
    </div>
  );
}
