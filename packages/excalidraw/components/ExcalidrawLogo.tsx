import "./ExcalidrawLogo.scss";

const LogoIcon = () => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="ExcalidrawLogo-icon"
  >
    <defs>
      <radialGradient id="braisedEggLogoGrad" cx="32%" cy="26%" r="80%">
        <stop offset="0%" stopColor="#f3cd8c" />
        <stop offset="55%" stopColor="#c8893f" />
        <stop offset="100%" stopColor="#6f431f" />
      </radialGradient>
    </defs>
    <ellipse cx="20" cy="23" rx="14" ry="16" fill="url(#braisedEggLogoGrad)" />
    <ellipse cx="15" cy="15" rx="4" ry="6" fill="#ffffff" opacity="0.22" />
    <path
      d="M14 6 Q20 1 26 6"
      stroke="#ffffff"
      strokeOpacity="0.55"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const LogoText = () => (
  <svg
    viewBox="0 0 250 55"
    xmlns="http://www.w3.org/2000/svg"
    className="ExcalidrawLogo-text"
  >
    <text
      x="0"
      y="40"
      fontSize="36"
      fontWeight="700"
      fontFamily="'Assistant', 'Segoe UI', system-ui, -apple-system, sans-serif"
      fill="currentColor"
      letterSpacing="-0.5"
    >
      BraisedEgg
    </text>
  </svg>
);


type LogoSize = "xs" | "small" | "normal" | "large" | "custom" | "mobile";

interface LogoProps {
  size?: LogoSize;
  withText?: boolean;
  style?: React.CSSProperties;
  /**
   * If true, the logo will not be wrapped in a Link component.
   * The link prop will be ignored as well.
   * It will merely be a plain div.
   */
  isNotLink?: boolean;
}

export const ExcalidrawLogo = ({
  style,
  size = "small",
  withText,
}: LogoProps) => {
  return (
    <div className={`ExcalidrawLogo is-${size}`} style={style}>
      <LogoIcon />
      {withText && <LogoText />}
    </div>
  );
};
