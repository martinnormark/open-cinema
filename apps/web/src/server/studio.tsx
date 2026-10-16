import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";

// Exercises the RSC path in the Workers build without requiring a database or login.
export const getStudioIntroduction = createServerFn({ method: "GET" }).handler(
  async () => {
    return renderServerComponent(
      <div>
        <h1
          id="page-title"
          className="text-3xl font-semibold tracking-tight text-balance"
        >
          Make a first frame
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Describe a scene, explore a direction, and see what emerges.
        </p>
      </div>,
    );
  },
);
