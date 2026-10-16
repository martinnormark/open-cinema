export { GenerationCoordinator } from "./generation-coordinator";

// No public job API: only the web Worker's private namespace binding may call the DO.
export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<JobsEnv>;
