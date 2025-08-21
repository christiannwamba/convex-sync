// convex/convex.config.ts
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();
app.use(workflow);


app.use(workpool, { name: "calendarApiWorkpool" });

export default app;
