/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://wearethelegion.com",

  // GitHub
  github: {
    repoUrl: "https://github.com/wearethelegion/legion",
    starsFormatted: {
      compact: "100K",
      full: "100,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/legion",
    discord: "https://discord.gg/legion",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "700",
    commits: "9,000",
    monthlyUsers: "2.5M",
  },
} as const
