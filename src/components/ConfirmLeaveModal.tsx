import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sound } from '../utils/sound';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  gameName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmLeaveModal: React.FC<ConfirmLeaveModalProps> = ({
  isOpen,
  gameName,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative space-y-4 text-center">
        {/* Warning Icon Badge */}
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center shadow-inner">
          <AlertTriangle className="w-6 h-6" />
        </div>

        {/* Heading & Subtext */}
        <div className="space-y-1.5">
          <h3 className="text-lg font-black text-slate-100">
            Are you sure you want to leave?
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {gameName ? (
              <>
                Your ongoing <strong className="text-amber-400">{gameName}</strong> match will be abandoned.
              </>
            ) : (
              'Leaving now will exit your active game session.'
            )}
          </p>
        </div>

        {/* Buttons: Yes & No */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              Sound.click();
              onCancel();
            }}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <span className="text-sm font-black text-white">No</span>
            <span className="text-[10px] text-slate-400 font-normal">Stay in game</span>
          </button>
          <button
            type="button"
            onClick={() => {
              Sound.click();
              onConfirm();
            }}
            className="py-3 px-4 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <span className="text-sm font-black">Yes</span>
            <span className="text-[10px] text-rose-200 font-normal">Leave match</span>
          </button>
        </div>
      </div>
    </div>
  );
};
