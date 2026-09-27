/** App identity: change the name here and it updates the home-screen label, manifest and tab title. */
export const APP = {
  name: "Panda Chef",
  // What sits under the icon on the home screen. Keep it to about 12 characters or iOS truncates it.
  shortName: "Panda Chef",
  description: "Our family recipes and shopping list",
  theme: "#F5EFE6", // C2 oat: status-bar colour on Android, splash background
  background: "#F5EFE6",
  // Recipes open showing amounts for this many people; change it per recipe with − / +.
  defaultPortions: 1,
} as const;
