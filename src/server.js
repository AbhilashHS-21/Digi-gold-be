import app from "./app.js";

import { startSipScheduler } from "./utils/sipScheduler.js";

const PORT = process.env.PORT || 5000;
startSipScheduler();
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
