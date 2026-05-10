import { Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  routeName: string;
  isOpen: boolean;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  routeName,
  isOpen,
  isDeleting = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fadeIn"
        onClick={onCancel}
      />
      {/* Modal */}
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-slideUp">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="bg-red-100 p-4 rounded-full">
            <Trash2 className="text-red-500" size={28} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Delete Route?</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-900">"{routeName}"</span>?{' '}
            This action cannot be undone.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 bg-red-500 rounded-xl text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
