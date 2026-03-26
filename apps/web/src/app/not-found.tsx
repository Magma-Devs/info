import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
      <p className="text-muted-foreground mt-2">Page not found</p>
      <Link href="/" className="text-accent hover:underline mt-4">
        Back to dashboard
      </Link>
    </div>
  );
}
