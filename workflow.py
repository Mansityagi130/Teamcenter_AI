import os
import re
import json
import logging
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Tuple, Dict, Any, Optional

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workflow")

BASE_DIR = Path(__file__).parent.resolve()
DB_FILE = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "teamcenter.db")))
DATA_FILE = Path(os.getenv("DATA_FILE_PATH", str(BASE_DIR / "data" / "items.csv")))
if not DATA_FILE.exists() and not os.getenv("DATA_FILE_PATH"):
    DATA_FILE = BASE_DIR / "Data" / "items.csv"

STATE_FILE = Path(os.getenv("WORKFLOW_STATE_PATH", str(BASE_DIR / "Data" / "workflow_state.json")))

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_data_file() -> None:
    # No-op since init_db in backend.py creates tables and migrates CSV
    pass

def item_exists(item_id: str) -> bool:
    with get_db_connection() as conn:
        row = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id.strip(),)).fetchone()
        return row is not None

def increment_revision(prev_rev: str) -> str:
    if not prev_rev:
        return 'A'
    prev_rev = prev_rev.upper().strip()
    if not prev_rev.isalpha():
        if prev_rev.isdigit():
            val = int(prev_rev) + 1
            return str(val).zfill(len(prev_rev))
        return 'A'
        
    chars = list(prev_rev)
    i = len(chars) - 1
    while i >= 0:
        if chars[i] == 'Z':
            chars[i] = 'A'
            i -= 1
        else:
            chars[i] = chr(ord(chars[i]) + 1)
            return "".join(chars)
    return "A" + "".join(chars)

def get_next_revision_id(conn, item_id: str) -> str:
    rows = conn.execute("SELECT revision_id FROM revisions WHERE item_id = ?", (item_id,)).fetchall()
    existing_revs = {row["revision_id"].upper() for row in rows}
    
    candidate = "A"
    while candidate.upper() in existing_revs:
        candidate = increment_revision(candidate)
        
    return candidate

def save_item_to_csv(item_id: str, item_name: str, item_description: str, revision_id: Optional[str] = None, created_by: str = "system") -> None:
    normalized_id = item_id.strip()
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        cursor = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized_id,))
        if cursor.fetchone() is None:
            conn.execute(
                "INSERT INTO items (item_id, item_name, item_description, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
                (normalized_id, item_name.strip(), item_description.strip(), now, now, created_by)
            )
        else:
            conn.execute(
                "UPDATE items SET item_name = ?, item_description = ?, updatedAt = ? WHERE item_id = ?",
                (item_name.strip(), item_description.strip(), now, normalized_id)
            )
            
        if revision_id is not None:
            cursor = conn.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (normalized_id, revision_id))
            if cursor.fetchone() is None:
                conn.execute(
                    "INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?)",
                    (revision_id, normalized_id, now, now, created_by)
                )
        conn.commit()

# Workflow State Persistence
def load_all_workflow_states() -> dict:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading workflow states: {e}")
        return {}

def save_all_workflow_states(states: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(states, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving workflow states: {e}")

def get_workflow_state(session_id: str) -> Optional[dict]:
    states = load_all_workflow_states()
    wf = states.get(session_id)
    if wf:
        updated_at_str = wf.get("updated_at")
        if updated_at_str:
            try:
                updated_at = datetime.fromisoformat(updated_at_str)
                # Stale workflow cleanup (10-minute timeout)
                if (datetime.utcnow() - updated_at).total_seconds() > 600:
                    clear_workflow_state(session_id)
                    return None
            except Exception:
                pass
    return wf

def save_workflow_state(session_id: str, state: str, data: dict, previous_state: str = None) -> None:
    states = load_all_workflow_states()
    states[session_id] = {
        "state": state,
        "data": data,
        "previous_state": previous_state,
        "updated_at": datetime.utcnow().isoformat(),
        "pendingAction": state,
        "currentWorkflow": "CreateItem",
        "currentField": None,
        "collectedData": data
    }
    save_all_workflow_states(states)

def clear_workflow_state(session_id: str) -> None:
    states = load_all_workflow_states()
    if session_id in states:
        del states[session_id]
        save_all_workflow_states(states)


# Fallback Teamcenter Knowledge Base Definitions
TEAMCENTER_KNOWLEDGE_BASE = {
    "lov": "A List of Values (LOV) in Teamcenter is a set of predefined values that can be assigned to a property. E.g., a status property might have an LOV containing 'Draft', 'Approved', 'Rejected'.",
    "bom": "A Bill of Materials (BOM) in Teamcenter represents a product structure. It is a hierarchical list of parts, assemblies, and components that make up a product, including quantities and revisions.",
    "iman": "IMAN (Information Manager) relations define how different objects (like Items, Datasets, or Revisions) are linked together in Teamcenter. For example, IMAN_specification links a dataset containing file data to an Item Revision.",
    "grm": "Generic Relationship Management (GRM) in Teamcenter manages relationships between objects. It defines relationship rules (primary class, secondary class, relationship type) and allows linking items, drawings, and documents.",
    "workflow": "A workflow in Teamcenter is an automated process that routes tasks to users for review, approval, or execution. It consists of tasks, paths, and handlers (action/rule handlers) to enforce business logic.",
    "bmide": "Business Modeler IDE (BMIDE) is the Teamcenter configuration tool used to customize the Teamcenter data model. It allows admins to define new classes, properties, LOVs, rules, and workflows.",
    "dataset": "A Dataset in Teamcenter is a container that holds physical files (like Word documents, CAD files, or PDFs) and manages their tool associations, versions, and permissions.",
    "item": "An Item in Teamcenter represents a physical component, assembly, or document. It has attributes like Item ID and Name, and contains one or more Item Revisions.",
    "revision": "An Item Revision in Teamcenter represents a specific version or iteration of an Item. It allows tracking changes to the item over time as it goes through design and approval phases.",
    "awc": "Active Workspace Client (AWC) is the modern, web-based, HTML5-compliant user interface for Siemens Teamcenter, designed to run on any device (phone, tablet, PC).",
    "itk": "Integration Toolkit (ITK) is a set of C-based APIs used to customize and extend the server-side logic and behaviors of Siemens Teamcenter.",
    "rac": "Rich Application Client (RAC) is the traditional Java-based desktop user interface for Siemens Teamcenter.",
    "soa": "Service Oriented Architecture (SOA) in Teamcenter provides web services (WSDL/JSON) to interact with the Teamcenter server from external clients or integrations."
}

def get_local_teamcenter_definition(message: str) -> Optional[str]:
    msg = message.lower()
    for key, definition in TEAMCENTER_KNOWLEDGE_BASE.items():
        if re.search(rf"\b{key}\b", msg):
            return (
                f"**Teamcenter PLM Concept: {key.upper()}**\n\n"
                f"{definition}\n\n"
                f"Would you like to know more about {key.upper()} or how it's customized in BMIDE?"
            )
    return None

# Parse Input locally (Fallback / Offline)
def parse_item_details_local(text: str) -> dict:
    details = {}
    
    # 1. Normalize delimiters: split by comma, semicolon, or newline
    segments = [s.strip() for s in re.split(r'[\n,;]+', text) if s.strip()]
    
    # 2. Check if we have key-value style segments (e.g. "ID: 1001" or "Name=Motor")
    has_kv = False
    for seg in segments:
        if ':' in seg or '=' in seg:
            parts = re.split(r'[:=]', seg, 1)
            key = parts[0].strip().lower()
            if any(x in key for x in ["id", "name", "desc", "option", "choice", "revision"]):
                has_kv = True
                break
                
    if has_kv:
        # Key-value parsing mode
        for seg in segments:
            if ':' in seg or '=' in seg:
                parts = re.split(r'[:=]', seg, 1)
                key = parts[0].strip().lower()
                val = parts[1].strip()
                if "item id" in key or key == "id" or "itemid" in key:
                    details["item_id"] = val
                elif "item name" in key or key == "name" or "itemname" in key:
                    details["item_name"] = val
                elif "item description" in key or "description" in key or key == "desc" or "itemdesc" in key:
                    details["item_description"] = val
                elif "revision option" in key or "revision id option" in key or "option" in key or "choice" in key or "revisionoption" in key:
                    val_lower = val.lower()
                    if "1" in val_lower or "custom" in val_lower:
                        details["revision_option"] = "1"
                    elif "2" in val_lower or "auto" in val_lower:
                        details["revision_option"] = "2"
    else:
        # Positional parsing mode (e.g. "0001, mansi, abcd, auto")
        if len(segments) >= 3:
            details["item_id"] = segments[0]
            details["item_name"] = segments[1]
            details["item_description"] = segments[2]
            if len(segments) >= 4:
                val = segments[3].lower()
                if "1" in val or "custom" in val:
                    details["revision_option"] = "1"
                elif "2" in val or "auto" in val:
                    details["revision_option"] = "2"

    # 3. Fallback heuristics for individual missing fields
    if not details.get("item_id"):
        ids = re.findall(r'\b[A-Za-z0-9_-]{3,20}\b', text)
        for val in ids:
            if val.isdigit() or val.startswith("ITEM_") or val.startswith("item_"):
                details["item_id"] = val
                break

    if not details.get("revision_option"):
        words = text.lower().split()
        if "1" in words or "custom" in words:
            details["revision_option"] = "1"
        elif "2" in words or "auto" in words or "auto-generated" in words:
            details["revision_option"] = "2"

    return details

# Parse using Gemini if online
def parse_item_details_gemini(gemini_client, model_name: str, message: str) -> dict:
    from google.genai import types
    prompt = (
        f"Extract item details from this user message:\n"
        f"\" {message} \"\n\n"
        f"Extract these fields into a JSON object:\n"
        f"- item_id (Item ID, string)\n"
        f"- item_name (Item Name, string)\n"
        f"- item_description (Item Description, string)\n"
        f"- revision_option (Should be '1' if user indicated option 1/custom revision, or '2' if user indicated option 2/auto-generated revision. If not specified, return null)\n\n"
        f"If a field is not present in the user's message, return null for that field.\n"
        f"Return ONLY valid JSON."
    )
    try:
        response = gemini_client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Gemini parsing failed: {e}")
        return {}

def perform_database_deletion(delete_type: str, target_id: str, extra_id: str = None, user_id: str = None) -> bool:
    with get_db_connection() as conn:
        if delete_type == "item":
            conn.execute("DELETE FROM items WHERE item_id = ?", (target_id,))
        elif delete_type == "user":
            if target_id.lower() == "system":
                return False
            conn.execute("DELETE FROM users WHERE username = ?", (target_id,))
        elif delete_type == "dataset":
            conn.execute("DELETE FROM datasets WHERE dataset_id = ?", (target_id,))
        elif delete_type == "workflow":
            conn.execute("DELETE FROM workflows WHERE workflow_id = ?", (target_id,))
        elif delete_type == "revision":
            conn.execute("DELETE FROM revisions WHERE item_id = ? AND revision_id = ?", (extra_id, target_id))
        
        if user_id:
            conn.execute(
                "INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES (?, ?, ?, ?)",
                (user_id, f"/{delete_type}/delete", f"chat_delete_{delete_type}:{target_id}", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
            )
        conn.commit()
    return True

def handle_workflow_message(session_id: str, user_id: str, message: str, gemini_client=None, gemini_model: str = "") -> Tuple[Optional[str], bool]:
    msg_clean = message.strip()
    msg_lower = msg_clean.lower()
    
    # Check if this is an explicit command to start/reset item creation
    item_create_match = re.match(r"^(?:add|create|new|insert)\s+(?:item|part)\b", msg_lower)
    if item_create_match:
        clear_workflow_state(session_id)
        
        # Check if the user already provided details inside the command (e.g. "add item 0001, motor, valve, auto")
        cmd_match = re.match(r"^(?:add|create|new|insert)\s+(?:item|part)\s*(.*)$", msg_clean, flags=re.IGNORECASE)
        additional_text = cmd_match.group(1).strip() if cmd_match else ""
        
        data = {}
        if additional_text:
            extracted = {}
            if gemini_client and gemini_model:
                extracted = parse_item_details_gemini(gemini_client, gemini_model, additional_text)
            local_extracted = parse_item_details_local(additional_text)
            for k, v in local_extracted.items():
                if v and not extracted.get(k):
                    extracted[k] = v
            for k in ["item_id", "item_name", "item_description", "revision_option"]:
                if extracted.get(k):
                    data[k] = extracted[k]
                    
        save_workflow_state(session_id, "AWAITING_DETAILS", data)
        wf = get_workflow_state(session_id)
    else:
        wf = get_workflow_state(session_id)
    
    # 1. Trigger workflow if not active
    if not wf:
        # Check for deletion commands to start confirmation flow
        delete_match = re.match(r"^(?:delete|remove|destroy|discard)\s+(item|user|dataset|revision|workflow)\s+(.+)$", msg_lower)
        if delete_match:
            entity_type = delete_match.group(1)
            target = delete_match.group(2).strip()
            
            # Special parsing for revision, which might look like "revision A of item 1001" or "revision 1001 A"
            extra_id = None
            if entity_type == "revision":
                # Check for "revision [rev_id] of item [item_id]"
                rev_of_item_match = re.match(r"^([a-z0-9_-]+)\s+of\s+item\s+([a-z0-9_-]+)$", target)
                if rev_of_item_match:
                    target = rev_of_item_match.group(1)
                    extra_id = rev_of_item_match.group(2)
                else:
                    # Check for "revision [item_id] [rev_id]"
                    item_rev_match = re.match(r"^([a-z0-9_-]+)\s+([a-z0-9_-]+)$", target)
                    if item_rev_match:
                        extra_id = item_rev_match.group(1) # item_id
                        target = item_rev_match.group(2) # rev_id
                    else:
                        return "To delete a revision, please specify both item ID and revision ID, e.g. 'delete revision A of item 1001' or 'delete revision 1001 A'.", False
            
            # Normalize target names
            if entity_type == "user":
                target = target.lower()
                if target == "system":
                    return "Error: The system user cannot be deleted.", False
            elif entity_type == "item":
                target = target.upper()
            elif entity_type == "revision" and extra_id:
                extra_id = extra_id.upper()
                target = target.upper()
                
            # Verify that the entity exists before asking for confirmation
            with get_db_connection() as conn:
                exists = False
                if entity_type == "item":
                    exists = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (target,)).fetchone() is not None
                elif entity_type == "user":
                    exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (target,)).fetchone() is not None
                elif entity_type == "dataset":
                    exists = conn.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (target,)).fetchone() is not None
                elif entity_type == "workflow":
                    exists = conn.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (target,)).fetchone() is not None
                elif entity_type == "revision":
                    exists = conn.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (extra_id, target)).fetchone() is not None
            
            if not exists:
                if entity_type == "revision":
                    return f"Error: Revision '{target}' for item '{extra_id}' not found.", False
                return f"Error: {entity_type.capitalize()} '{target}' not found.", False
                
            # Store state
            save_workflow_state(session_id, "AWAITING_DELETE_CONFIRMATION", {
                "delete_type": entity_type,
                "target_id": target,
                "extra_id": extra_id
            })
            
            entity_description = f"{entity_type} '{target}'"
            if entity_type == "revision":
                entity_description = f"revision '{target}' of item '{extra_id}'"
                
            response = (
                f"⚠️ WARNING: Are you sure you want to delete {entity_description}?\n"
                "This will permanently delete it and cannot be undone.\n\n"
                "Please type **Yes** to confirm, or **No** to cancel."
            )
            return response, True
            
        return None, False
    
    # 2. Check for cancellation
    if msg_lower in ["cancel", "exit", "stop"]:
        clear_workflow_state(session_id)
        return "Item creation cancelled.", False

    # Check for other commands/definitions that should cancel/exit the workflow
    if not item_create_match:
        try:
            from backend import get_canonical_intent
            canonical_intent, _ = get_canonical_intent(message)
        except ImportError:
            canonical_intent = None

        if canonical_intent in [
            "LIST_ITEMS_INTENT", "SEARCH_ITEM_INTENT", "DELETE_ITEM_INTENT", 
            "ADD_ITEM_INTENT", "UPDATE_ITEM_INTENT", "FEATURES_INTENT", "PROFILE_INTENT",
            "ADD_DATASET_INTENT", "LIST_DATASETS_INTENT", "ADD_REVISION_INTENT", 
            "LIST_REVISIONS_INTENT", "ADD_WORKFLOW_INTENT", "LIST_WORKFLOWS_INTENT",
            "LIST_USERS_INTENT", "SEARCH_USER_INTENT", "DELETE_USER_INTENT"
        ]:
            clear_workflow_state(session_id)
            return None, False

    definition = get_local_teamcenter_definition(message)
    if definition:
        # Avoid interrupting workflow on generic terms used in form/labels
        matched_key = None
        for key in TEAMCENTER_KNOWLEDGE_BASE.keys():
            if re.search(rf"\b{key}\b", msg_lower):
                matched_key = key
                break
        if matched_key not in {"item", "revision", "workflow"}:
            clear_workflow_state(session_id)
            return definition, False
        
    state = wf.get("state")
    data = wf.get("data", {})
    
    # Handle AWAITING_DELETE_CONFIRMATION
    if state == "AWAITING_DELETE_CONFIRMATION":
        yes_match = re.search(r"\b(yes|y|sure|confirm|ok|okay|yes please)\b", msg_lower)
        no_match = re.search(r"\b(no|n|stop|cancel|dont|don't)\b", msg_lower)
        
        delete_type = data.get("delete_type")
        target_id = data.get("target_id")
        extra_id = data.get("extra_id")
        
        entity_description = f"{delete_type} '{target_id}'"
        if delete_type == "revision":
            entity_description = f"revision '{target_id}' of item '{extra_id}'"
            
        if yes_match:
            try:
                success = perform_database_deletion(delete_type, target_id, extra_id, user_id=user_id)
                clear_workflow_state(session_id)
                if success:
                    return f"Success! {entity_description.capitalize()} has been deleted.", False
                else:
                    return f"Error: Failed to delete {entity_description}.", False
            except Exception as e:
                clear_workflow_state(session_id)
                return f"Error deleting {entity_description}: {str(e)}", False
        elif no_match:
            clear_workflow_state(session_id)
            return f"Deletion of {entity_description} was cancelled.", False
        else:
            return f"Please confirm: do you want to delete {entity_description}? (Yes/No)", True
            
    # 3. Handle AWAITING_RECOVERY
    if state == "AWAITING_RECOVERY":
        # Intelligent Input Detection: if user provides details directly, transition back to details
        extracted = {}
        if gemini_client and gemini_model:
            extracted = parse_item_details_gemini(gemini_client, gemini_model, msg_clean)
        local_extracted = parse_item_details_local(msg_clean)
        for k, v in local_extracted.items():
            if v and not extracted.get(k):
                extracted[k] = v
                
        if extracted.get("item_id"):
            state = "AWAITING_DETAILS"
            for k in ["item_id", "item_name", "item_description", "revision_option"]:
                if extracted.get(k):
                    data[k] = extracted[k]
            save_workflow_state(session_id, "AWAITING_DETAILS", data)
            # Fall through to AWAITING_DETAILS logic below!
        else:
            yes_match = re.search(r"\b(yes|y|sure|continue|ok|okay|yes please)\b", msg_lower)
            no_match = re.search(r"\b(no|n|stop|cancel|start fresh)\b", msg_lower)
            
            if yes_match:
                prev_state = wf.get("previous_state") or "AWAITING_DETAILS"
                save_workflow_state(session_id, prev_state, data)
                if prev_state == "AWAITING_DETAILS":
                    response = (
                        "Great! Let's resume. Please provide:\n"
                        "* Item ID\n"
                        "* Item Name\n"
                        "* Item Description\n\n"
                        "Also choose Revision ID option:\n"
                        "1. Custom Revision ID\n"
                        "2. Auto-generated Revision ID"
                    )
                else: # AWAITING_CUSTOM_REVISION
                    response = "Great! Let's resume. Please enter your custom Revision ID (e.g. A, 01, Rev-A):"
                return response, True
            elif no_match:
                clear_workflow_state(session_id)
                return "Okay, let's start fresh. How can I help you today?", False
            else:
                return "Please let me know if you would like to continue creating the item. (Yes/No)", True
            
    # 4. Handle AWAITING_DETAILS
    if state == "AWAITING_DETAILS":
        # Extract fields
        extracted = {}
        if gemini_client and gemini_model:
            extracted = parse_item_details_gemini(gemini_client, gemini_model, msg_clean)
        
        # Merge with local parser fallback
        local_extracted = parse_item_details_local(msg_clean)
        for k, v in local_extracted.items():
            if v and not extracted.get(k):
                extracted[k] = v
                
        # Merge into existing data
        for k in ["item_id", "item_name", "item_description", "revision_option"]:
            if extracted.get(k) and not data.get(k):
                data[k] = extracted[k]
                
        # Validate Item ID format
        item_id = data.get("item_id")
        if not item_id:
            # If they just started and data is empty, ask for details structured once
            if not any(data.values()):
                return (
                    "Sure, please provide the following details:\n"
                    "* Item ID\n"
                    "* Item Name\n"
                    "* Item Description\n\n"
                    "Also choose Revision ID option:\n"
                    "1. Custom Revision ID\n"
                    "2. Auto-generated Revision ID"
                ), True
            else:
                return (
                    "I couldn't understand the Item ID.\n"
                    "Please enter a valid Item ID like:\n"
                    "1001 or ITEM_1001"
                ), True
            
        # Validate if Item ID is valid alphanumeric string
        if not re.match(r"^[A-Za-z0-9_-]+$", item_id):
            return (
                f"I couldn't understand the Item ID. The ID '{item_id}' contains invalid characters.\n"
                "Please enter a valid Item ID like:\n"
                "1001 or ITEM_1001"
            ), True

        # Check if Item ID already exists
        if item_exists(item_id):
            # Reset item_id in data so they can provide a new one
            data["item_id"] = None
            save_workflow_state(session_id, "AWAITING_DETAILS", data)
            return f"An item with ID '{item_id}' already exists in Teamcenter. Please enter a different Item ID.", True
            
        # Save progress
        save_workflow_state(session_id, "AWAITING_DETAILS", data)
        
        # Check missing fields
        missing = []
        if not data.get("item_name"):
            missing.append("Item Name")
        if not data.get("item_description"):
            missing.append("Item Description")
        if not data.get("revision_option"):
            missing.append("Revision ID Option (1. Custom, 2. Auto-generated)")
            
        if missing:
            # List missing fields and ask again politely
            response = "I still need the following details to create the item:\n"
            for m in missing:
                response += f"* {m}\n"
            response += "\nPlease provide them (e.g. 'Name: Valve, Description: Control valve, Option: 2')."
            return response, True
            
        # If all details are present
        revision_opt = data.get("revision_option")
        if revision_opt == "1":
            # Transition to custom revision
            save_workflow_state(session_id, "AWAITING_CUSTOM_REVISION", data)
            return "Great! Please enter your custom Revision ID (e.g. A, 01, Rev-A):", True
        else:
            # Auto-generated Revision
            with get_db_connection() as conn:
                revision_id = get_next_revision_id(conn, data["item_id"])
            save_item_to_csv(data["item_id"], data["item_name"], data["item_description"], revision_id, created_by=user_id)
            clear_workflow_state(session_id)
            response = (
                "Success! Item created successfully:\n"
                f"* **Item ID**: {data['item_id']}\n"
                f"* **Item Name**: {data['item_name']}\n"
                f"* **Item Description**: {data['item_description']}\n"
                f"* **Revision ID**: {revision_id} (Auto-generated)"
            )
            return response, False

    # 5. Handle AWAITING_CUSTOM_REVISION
    if state == "AWAITING_CUSTOM_REVISION":
        revision_id = msg_clean
        if not re.match(r"^[A-Za-z0-9_-]+$", revision_id):
            return "Invalid Revision ID. Please enter a valid Revision ID (e.g. A, 01, Rev-1):", True
            
        save_item_to_csv(data["item_id"], data["item_name"], data["item_description"], revision_id, created_by=user_id)
        clear_workflow_state(session_id)
        response = (
            "Success! Item created successfully:\n"
            f"* **Item ID**: {data['item_id']}\n"
            f"* **Item Name**: {data['item_name']}\n"
            f"* **Item Description**: {data['item_description']}\n"
            f"* **Revision ID**: {revision_id} (Custom)"
        )
        return response, False

    return None, False
