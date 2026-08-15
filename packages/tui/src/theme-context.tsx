import React, { createContext, useContext } from "react";
import { DEFAULT_THEME, type ThemeInstance } from "./theme.js";

const ThemeContext = createContext<ThemeInstance>(DEFAULT_THEME);

/** Wraps the surface tree with the resolved theme instance. */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: ThemeInstance;
  children: React.ReactNode;
}): React.JSX.Element {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Resolve the active theme inside any component. */
export function useTheme(): ThemeInstance {
  return useContext(ThemeContext);
}
