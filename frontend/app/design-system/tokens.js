/** ============================================================
 *  AUTOFORCE DESIGN SYSTEM — JS/TS Tokens
 *  Use para acessar os tokens em lógica JavaScript/TypeScript
 * ============================================================ */

export const colors = {
  autoforce: {
    50:  "#F0F4FE",
    100: "#DDE6FC",
    200: "#C2D3FB",
    300: "#98B7F8",
    400: "#6892F2",
    500: "#456CEC",
    600: "#3754E2",
    700: "#273BCE",
    800: "#2531A8",
    900: "#242F84",
  },
  base: {
    white: "#FFFFFF",
    black: "#000000",
  },
  slate: {
    50:  "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
  },
  red: {
    50:  "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    300: "#FCA5A5",
    400: "#F87171",
    450: "#F45B5B",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
    800: "#991B1B",
    900: "#7F1D1D",
  },
  yellow: {
    50:  "#FEFCE8",
    100: "#FEF9C3",
    200: "#FEF08A",
    300: "#FDE047",
    400: "#FACC15",
    500: "#EAB308",
    600: "#CA8A04",
    700: "#A16207",
    800: "#854D0E",
    900: "#713F12",
  },
  green: {
    50:  "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },
};

export const typography = {
  fontFamily: "Poppins, sans-serif",
  heading: {
    fontWeight: 600,
    fontSizeDesktop: "40px",
    fontSizeMobile: "32px",
    lineHeight: 1.2,
    letterSpacing: "0px",
  },
  subheading: {
    fontWeight: 400,
    fontSizeDesktop: "20px",
    fontSizeMobile: "18px",
    lineHeight: 1.5,
    letterSpacing: "0px",
  },
  title: {
    fontWeight: 600,
    fontSizeDesktop: "20px",
    fontSizeMobile: "18px",
    lineHeight: 1.5,
    letterSpacing: "0px",
  },
  text: {
    fontWeight: 400,
    fontSizeDesktop: "16px",
    fontSizeMobile: "16px",
    lineHeight: 1.5,
    letterSpacing: "0px",
  },
};

export const design = {
  button: {
    borderRadius: "6px",
    borderWidth: "1px",
  },
  card: {
    borderRadius: "8px",
    borderWidth: "1px",
  },
  radius: "0.5rem",
};

export const semantic = {
  primary:          colors.autoforce[600],
  primaryHover:     colors.autoforce[700],
  primaryLight:     colors.autoforce[100],
  destructive:      colors.red[600],
  destructiveHover: colors.red[700],
  success:          colors.green[600],
  border:           colors.slate[200],
  input:            colors.slate[300],
  muted:            colors.slate[100],
  mutedForeground:  colors.slate[500],
};
