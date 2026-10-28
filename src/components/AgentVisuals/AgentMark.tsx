import {
  SiClaude,
  SiOpenai,
  SiGooglegemini,
  SiNotion,
  SiSlack,
  SiFigma,
  SiGithub,
  SiStripe,
} from 'react-icons/si';
const marks = {
  claude: SiClaude,
  codex: SiOpenai,
  openai: SiOpenai,
  gemini: SiGooglegemini,
  notion: SiNotion,
  slack: SiSlack,
  figma: SiFigma,
  github: SiGithub,
  stripe: SiStripe,
};
const colors: Record<string, string> = {
  claude: '#d87b5a',
  gemini: '#4387ff',
  slack: '#36c5f0',
  figma: '#a259ff',
  stripe: '#7764ff',
};
export function AgentMark({ name }: { name: string }) {
  const Icon = marks[name.toLowerCase() as keyof typeof marks];
  return Icon ? (
    <Icon aria-hidden="true" style={{ color: colors[name.toLowerCase()] }} />
  ) : (
    <>{name}</>
  );
}
