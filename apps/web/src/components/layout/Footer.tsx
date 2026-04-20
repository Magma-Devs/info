import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <span className="text-sm text-muted-foreground">
        <Link
          href="https://www.lavanet.xyz/"
          className="footer-link flex items-center"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://lava-fe-assets.s3.amazonaws.com/lava-icon.svg"
            alt="Lava Network Logo"
            width={24}
            height={24}
            style={{ marginRight: "10px", marginLeft: "30px" }}
          />
          <span>Lava Network</span>
        </Link>
      </span>
      <span className="ml-auto text-sm text-muted-foreground" style={{ marginRight: "30px" }}>
        Made with ❤️ by&nbsp;
        <Link
          href="https://magmadevs.com/"
          className="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Magma Devs
        </Link>
      </span>
    </footer>
  );
}
