export function NotebookAgentLogo({ logo }: { logo: string }) {
  return /^data:image\/(png|jpeg|webp);base64,/.test(logo) ? (
    <img src={logo} alt="Agent logo" className="h-4 w-4 shrink-0 rounded object-cover" />
  ) : (
    <span className="shrink-0" aria-label="Agent logo">
      {logo}
    </span>
  );
}
