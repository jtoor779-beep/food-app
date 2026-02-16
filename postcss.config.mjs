// Tailwind disabled temporarily to restore the app (Turbopack + Windows ROOT path bug).
// We will re-enable Tailwind later safely (either via Webpack or stable setup).

import autoprefixer from "autoprefixer";

export default {
  plugins: [autoprefixer],
};
