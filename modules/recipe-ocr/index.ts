import { requireOptionalNativeModule } from 'expo';

import type { OcrBlock } from '@/src/core/ocrLayout';

interface RecipeOcrModule {
  recognize(uri: string): Promise<OcrBlock[]>;
}

/** The Android text recognition module, or null where it isn't built in (web, Expo Go). */
export default requireOptionalNativeModule<RecipeOcrModule>('RecipeOcr');
