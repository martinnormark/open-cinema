import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  addElementReferenceInputSchema,
  createElementInputSchema,
  createElementStateInputSchema,
  updateElementInputSchema,
  updateElementStateInputSchema,
  updateElementReferenceInputSchema,
  type Element,
} from "@open-cinema/contracts";
import { listElements, resolveAssetRef } from "@open-cinema/database/queries";
import {
  addElementReference,
  createElement,
  createElementState,
  deleteElement,
  deleteElementState,
  removeElementReference,
  updateElement,
  updateElementReference,
  updateElementState,
} from "@open-cinema/database/mutations";
import { saveFailure, mutate, owner } from "./scope";

function found(element: Element | null): Element {
  if (!element) throw new Error("This Element is no longer available.");
  return element;
}
function failure(error: unknown): never {
  return saveFailure(error, "Your Elements could not be saved. Try again.");
}

export const listMyElements = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; elements: Element[] }> => {
    let context;
    try {
      context = await owner();
    } catch {
      return { signedIn: false, elements: [] };
    }
    return {
      signedIn: true,
      elements: await listElements(context.db, context.scope),
    };
  },
);

export const createMyElement = createServerFn({ method: "POST" })
  .validator(createElementInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return createElement(db, scope, data).catch(failure);
  });

export const updateMyElement = createServerFn({ method: "POST" })
  .validator(updateElementInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await updateElement(db, scope, data).catch(failure));
  });

export const deleteMyElement = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return { ok: await deleteElement(db, scope, data.id) };
  });

export const addMyElementReference = createServerFn({ method: "POST" })
  .validator(addElementReferenceInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    if (
      data.asset.type === "job-output" &&
      !(await resolveAssetRef(db, scope, data.asset))
    )
      throw new Error(
        "This image is still being saved. Try again in a moment.",
      );
    return found(await addElementReference(db, scope, data).catch(failure));
  });

export const updateMyElementReference = createServerFn({ method: "POST" })
  .validator(updateElementReferenceInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await updateElementReference(db, scope, data).catch(failure));
  });

export const removeMyElementReference = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(
      await removeElementReference(db, scope, data.id).catch(failure),
    );
  });

export const createMyElementState = createServerFn({ method: "POST" })
  .validator(createElementStateInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await createElementState(db, scope, data).catch(failure));
  });

export const deleteMyElementState = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await deleteElementState(db, scope, data.id).catch(failure));
  });

export const updateMyElementState = createServerFn({ method: "POST" })
  .validator(updateElementStateInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await updateElementState(db, scope, data).catch(failure));
  });
