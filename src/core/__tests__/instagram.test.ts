import { describe, expect, it } from 'vitest';

import { captionFromEmbedHtml, cleanCaption, instagramPost } from '../instagram';
import { parseRecipeText } from '../recipeText';

describe('instagramPost', () => {
  it('reads links shared from the Instagram app', () => {
    expect(instagramPost('https://www.instagram.com/reel/C272uxmAVe3/?igsh=MWQ1ZGUxMzBkMA==')).toEqual({
      code: 'C272uxmAVe3',
      url: 'https://www.instagram.com/reel/C272uxmAVe3/',
      embedUrl: 'https://www.instagram.com/reel/C272uxmAVe3/embed/captioned/',
    });
    expect(instagramPost('Check this out https://instagram.com/p/Bq3ckR8HIDE')?.embedUrl).toBe(
      'https://www.instagram.com/p/Bq3ckR8HIDE/embed/captioned/',
    );
  });

  it('handles the other address forms', () => {
    expect(instagramPost('www.instagram.com/reels/DGtu1YbPwd9/')?.url).toBe('https://www.instagram.com/reel/DGtu1YbPwd9/');
    expect(instagramPost('https://www.instagram.com/recipe_tin/p/Bq3ckR8HIDE/')?.code).toBe('Bq3ckR8HIDE');
    expect(instagramPost('https://m.instagram.com/p/Bq3ckR8HIDE/')?.code).toBe('Bq3ckR8HIDE');
    expect(instagramPost('https://instagr.am/p/Bq3ckR8HIDE/')?.code).toBe('Bq3ckR8HIDE');
    expect(instagramPost('https://www.instagram.com/tv/Bq3ckR8HIDE/')?.embedUrl).toBe(
      'https://www.instagram.com/p/Bq3ckR8HIDE/embed/captioned/',
    );
  });

  it('ignores profiles, stories and other sites', () => {
    expect(instagramPost('https://www.instagram.com/recipe_tin/')).toBeNull();
    expect(instagramPost('https://www.instagram.com/stories/recipe_tin/123/')).toBeNull();
    expect(instagramPost('https://www.recipetineats.com/p/lasagna/')).toBeNull();
    expect(instagramPost('https://notinstagram.com/p/Bq3ckR8HIDE/')).toBeNull();
  });
});

describe('cleanCaption', () => {
  it('drops hashtags, emoji bullets and the comments link', () => {
    const raw = [
      '🍋 Lemon slice 🍋',
      '',
      '',
      '',
      '🛒 Ingredients:',
      '✅ 250g Marie biscuits',
      '• 1/2 cup condensed milk',
      '',
      'Enjoy! #lemon #slice',
      '#baking #dessert #easyrecipes',
      'View all 60 comments',
    ].join('\n');
    expect(cleanCaption(raw)).toBe(
      ['Lemon slice 🍋', '', 'Ingredients:', '250g Marie biscuits', '- 1/2 cup condensed milk', '', 'Enjoy!'].join('\n'),
    );
  });
});

// The embed page's caption markup, as Instagram served it in November 2026,
// with an invented recipe in place of the post's words.
const EMBED_HTML = `<html><body><div class="EmbedCaption"><div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/somecook/?utm_source=ig_embed" data-log-event="captionProfileClick" target="_blank">somecook</a><br /><br />Creamy garlic chicken pasta 🍝 Serves 4<br /><br />📝 INGREDIENTS<br />• 400g penne<br />• 2 chicken breasts, sliced<br />• 4 garlic cloves, minced<br />• 1 cup (250ml) thickened cream<br />• ½ cup grated parmesan<br />• Salt &amp; pepper<br /><br />👩‍🍳 METHOD<br />1. Cook the penne in salted water.<br />2. Brown the chicken, then add the garlic.<br />3. Stir in the cream and parmesan, then toss with the pasta.<br /><br />Save this for later! 💛<br /><br /><a href="/explore/tags/pasta/?utm_source=ig_embed">#pasta</a> <a href="/explore/tags/dinner/?utm_source=ig_embed">#dinner</a><div class="CaptionComments"><a class="CaptionCommentsExpand" href="https://www.instagram.com/reel/C272uxmAVe3/?utm_source=ig_embed" target="_blank">View all 60 comments</a></div></div></div></body></html>`;

describe('captionFromEmbedHtml', () => {
  it('reads the caption with its line breaks, without the account name or comments link', () => {
    const caption = captionFromEmbedHtml(EMBED_HTML)!;
    expect(caption.split('\n').slice(0, 4)).toEqual(['Creamy garlic chicken pasta 🍝 Serves 4', '', 'INGREDIENTS', '- 400g penne']);
    expect(caption).toContain('- Salt & pepper');
    expect(caption).not.toContain('somecook');
    expect(caption).not.toContain('#pasta');
    expect(caption).not.toMatch(/comments/);
    expect(caption).not.toContain('Save this');
    expect(caption.endsWith('toss with the pasta.')).toBe(true);
  });

  it('gives null when the post has no caption (private or deleted)', () => {
    expect(captionFromEmbedHtml('<html><body><div class="EmbedBrokenMedia">This post is unavailable</div></body></html>')).toBeNull();
  });

  it('sorts into a recipe with the paste-text reader', () => {
    const recipe = parseRecipeText(captionFromEmbedHtml(EMBED_HTML)!, 'https://www.instagram.com/reel/C272uxmAVe3/');
    expect(recipe.title).toMatch(/Creamy garlic chicken pasta/);
    expect(recipe.ingredients.flatMap((g) => g.items)).toEqual([
      '400g penne',
      '2 chicken breasts, sliced',
      '4 garlic cloves, minced',
      '1 cup (250ml) thickened cream',
      '½ cup grated parmesan',
      'Salt & pepper',
    ]);
    expect(recipe.instructions.flatMap((g) => g.steps)).toHaveLength(3);
    expect(recipe.sourceUrl).toBe('https://www.instagram.com/reel/C272uxmAVe3/');
  });
});
