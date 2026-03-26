export function Footer() {
  return (
    <footer className="border-t border-border" style={{ backgroundColor: "#110e0ee1" }}>
      <div className="max-w-[1536px] mx-auto px-5 h-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>Made with</span>
        <span>❤️</span>
        <span>by</span>
        <a href="https://x.com/user" className="hover:text-foreground transition-colors">Magma Devs</a>
        <span>|</span>
        <a href="https://www.lavanet.xyz" className="hover:text-foreground transition-colors">
          <img src="https://lava-fe-assets.s3.amazonaws.com/lava-icon.svg" alt="Lava" className="h-5 w-5 inline" />
        </a>
      </div>
    </footer>
  );
}
