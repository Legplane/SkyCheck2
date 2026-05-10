import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { getRoutes, deleteRoute } from '../../api';
import type { Route } from '../../types';
import RouteCard from '../../components/RouteCard';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import { RouteCardSkeleton } from '../../components/SkeletonLoader';
import AddRouteSheet from './AddRouteSheet';

const MAX_ROUTES = 5;

export default function RoutesPage() {
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);
  const [editTarget, setEditTarget] = useState<Route | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: getRoutes,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const { mutate: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => deleteRoute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      setDeleteTarget(null);
    },
  });

  const limitReached = routes.length >= MAX_ROUTES;

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-20">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">My Routes</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">{routes.length}/{MAX_ROUTES} saved</span>
          <button
            onClick={() => setShowAddSheet(true)}
            disabled={limitReached}
            className="p-2 bg-primary-600 text-white rounded-xl disabled:opacity-40 hover:bg-primary-700 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3">
        {/* Skeletons */}
        {isLoading && [1, 2].map(i => <RouteCardSkeleton key={i} />)}

        {/* Route Cards */}
        {!isLoading && routes.map(route => (
          <RouteCard
            key={route.id}
            route={route}
            onEdit={r => { setEditTarget(r); setShowAddSheet(true); }}
            onDelete={r => setDeleteTarget(r)}
          />
        ))}

        {/* Add route CTA rows */}
        {!isLoading && !limitReached && (
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Add a new route
          </button>
        )}

        {/* Limit reached */}
        {!isLoading && limitReached && (
          <div className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-xs text-gray-400 text-center">
            5/5 — Route limit reached
          </div>
        )}

        {/* Empty state */}
        {!isLoading && routes.length === 0 && (
          <div className="flex flex-col items-center text-center gap-4 py-16">
            <span className="text-6xl">🗺️</span>
            <div>
              <p className="font-semibold text-gray-700">No routes saved yet</p>
              <p className="text-sm text-gray-500 mt-1">Add your first route to see your commute risk.</p>
            </div>
            <button
              onClick={() => setShowAddSheet(true)}
              className="px-6 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              Add First Route
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        routeName={deleteTarget?.label ?? `${deleteTarget?.startAddress?.split(',')[0]} → ${deleteTarget?.destAddress?.split(',')[0]}`}
        isOpen={!!deleteTarget}
        isDeleting={isDeleting}
        onConfirm={() => deleteTarget && doDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Add / Edit Route Bottom Sheet */}
      {showAddSheet && (
        <AddRouteSheet
          editRoute={editTarget}
          onClose={() => { setShowAddSheet(false); setEditTarget(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['routes'] }); setShowAddSheet(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
