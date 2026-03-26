export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400 mr-3" />
      {text}
    </div>
  );
}
