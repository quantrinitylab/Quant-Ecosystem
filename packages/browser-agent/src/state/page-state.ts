import type { BrowserAction, ActionResult, PageState, FormField } from '../types.js';

export class PageStateManager {
  createFromSnapshot(
    url: string,
    title: string,
    elements: { formFields?: FormField[]; clickable?: string[]; text?: string },
  ): PageState {
    return {
      url,
      title,
      visibleText: elements.text ?? '',
      formFields: elements.formFields ?? [],
      clickableElements: elements.clickable ?? [],
      domSummary: `Page: ${title} (${url})`,
    };
  }

  updateAfterAction(state: PageState, action: BrowserAction, result: ActionResult): PageState {
    const updated = { ...state };
    if (action.type === 'navigate') updated.url = action.url;
    if (result.screenshot) updated.screenshotUri = result.screenshot;
    if (result.data)
      updated.extractedData = { ...(state.extractedData ?? {}), latest: result.data };
    return updated;
  }

  summarizeForLLM(state: PageState): string {
    return `URL: ${state.url}\nTitle: ${state.title}\nText: ${state.visibleText.slice(0, 200)}\nFields: ${state.formFields.length}\nClickable: ${state.clickableElements.length}`;
  }

  extractFormFields(state: PageState): FormField[] {
    return state.formFields;
  }
}
