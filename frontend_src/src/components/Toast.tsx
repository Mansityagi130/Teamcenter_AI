import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, removeToast } from '../store';

export function ToastContainer() {
  const toastQueue = useSelector((state: RootState) => state.notifications.toastQueue);
  const dispatch = useDispatch();

  return (
    <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toastQueue.map((toast) => {
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

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg cursor-pointer animate-in fade-in slide-in-from-top-4 duration-300 ${colors}`}
            onClick={() => dispatch(removeToast(toast.id))}
          >
            <span className="material-symbols-outlined text-lg flex-shrink-0">{icon}</span>
            <span className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</span>
            <span className="material-symbols-outlined text-sm hover:opacity-80 transition-opacity">close</span>
          </div>
        );
      })}
    </div>
  );
}
