import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, removeToast, ToastNotification } from '../store';

function ToastItem({ toast }: { toast: ToastNotification }) {
  const dispatch = useDispatch();
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    // Success / Info / Warning: auto-dismiss after 4 seconds (4000ms)
    // Error: auto-dismiss after 9 seconds (9000ms)
    const delay = toast.type === 'error' ? 9000 : 4000;

    const timer = setTimeout(() => {
      handleClose();
    }, delay);

    return () => clearTimeout(timer);
  }, [toast.id, toast.type]);

  const handleClose = () => {
    setIsDismissing(true);
    // Wait for the fade-out/slide-up transition (200ms) before removing from state
    setTimeout(() => {
      dispatch(removeToast(toast.id));
    }, 200);
  };

  let colors = 'bg-surface-container border-outline-variant/10 text-on-surface';
  let icon = 'info';

  if (toast.type === 'success') {
    colors = 'bg-tertiary-container/30 border-tertiary/20 text-tertiary';
    icon = 'check_circle';
  } else if (toast.type === 'error') {
    colors = 'bg-error-container/20 border-error/30 text-error';
    icon = 'error';
  } else if (toast.type === 'warning') {
    colors = 'bg-secondary-container/10 border-secondary-fixed-dim/20 text-secondary-fixed-dim';
    icon = 'warning';
  }

  // Choose show or hide animation class
  const animationClass = isDismissing ? 'animate-toast-hide' : 'animate-toast-show';

  return (
    <div
      onClick={handleClose}
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg cursor-pointer transition-all duration-200 ${animationClass} ${colors}`}
    >
      <span className="material-symbols-outlined text-lg flex-shrink-0">{icon}</span>
      <span className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</span>
      <span className="material-symbols-outlined text-sm hover:opacity-80 transition-opacity">close</span>
    </div>
  );
}

export function ToastContainer() {
  const toastQueue = useSelector((state: RootState) => state.notifications.toastQueue);

  return (
    <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {/* Reverse the queue so the newest notification is at the TOP and older ones stack BELOW */}
      {[...toastQueue].reverse().map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
