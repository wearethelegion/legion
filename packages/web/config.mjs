const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://legion.dev" : `https://${stage}.legion.dev`,
  console: stage === "production" ? "https://legion.dev/auth" : `https://${stage}.legion.dev/auth`,
  email: "contact@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/wearethelegion/legion",
  discord: "https://legion.dev/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
