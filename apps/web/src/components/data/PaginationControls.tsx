interface PaginationControlsProps {
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  onPageChange: (page: number) => void;
}

export function PaginationControls({ pagination, onPageChange }: PaginationControlsProps) {
  if (pagination.pages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-6 py-4 text-sm text-muted-foreground border-t border-border">
      <span>
        Showing {(pagination.page - 1) * pagination.limit + 1}-
        {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
      </span>
      <div className="flex gap-2">
        <button
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
        >
          Previous
        </button>
        <button
          disabled={pagination.page >= pagination.pages}
          onClick={() => onPageChange(pagination.page + 1)}
          className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
        >
          Next
        </button>
      </div>
    </div>
  );
}
