import { Tool } from '../types';
import { screenshotManager } from '../../screenshot-manager';

export const takeScreenshot: Tool = {
  definition: {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the running application preview. Use this to visually verify your changes, check layout issues, or see runtime errors. Returns an image you can analyze.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
  },

  async execute(args, ctx) {
    const { callbacks } = ctx;

    if (!callbacks.onScreenshotRequest) {
      return { content: 'Screenshot capture is not available in this environment.', isError: true };
    }

    try {
      const imageData = await screenshotManager.requestScreenshot(
        (requestId) => callbacks.onScreenshotRequest!(requestId)
      );
      // Return a special marker with the image data that the provider can parse
      // Format: [SCREENSHOT:<base64>]
      return { content: `[SCREENSHOT:${imageData}]`, isError: false };
    } catch (err: any) {
      return { content: `Failed to capture screenshot: ${err.message}`, isError: true };
    }
  }
};
