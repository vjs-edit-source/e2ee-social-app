/**
 * Client-Side Zero-Knowledge Full-Text Search Engine
 * Runs 100% in-memory in the browser. Zero search queries leave the device.
 */

// Helper to safely escape special characters in regular expressions (?, *, +, (, ), [, ], \, etc.)
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class ClientSearchIndex {
  constructor() {
    this.posts = [];    // Array of { id, author, text, timestamp, type: 'post' }
    this.messages = []; // Array of { id, sender, recipient, text, timestamp, type: 'message' }
  }

  clear() {
    this.posts = [];
    this.messages = [];
  }

  indexPost(id, author, decryptedText, timestamp) {
    if (!id || !decryptedText) return;
    this.posts = this.posts.filter(p => p.id !== id);
    this.posts.push({
      id,
      author,
      text: decryptedText,
      timestamp,
      type: 'post'
    });
  }

  indexMessage(id, sender, recipient, decryptedText, timestamp) {
    if (!id || !decryptedText) return;
    this.messages = this.messages.filter(m => m.id !== id);
    this.messages.push({
      id,
      sender,
      recipient,
      text: decryptedText,
      timestamp,
      type: 'message'
    });
  }

  search(query) {
    if (!query || !query.trim()) return [];
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

    const results = [];

    // Search Posts
    for (const post of this.posts) {
      const matchScore = this.calculateScore(post.text, post.author, tokens);
      if (matchScore > 0) {
        results.push({
          ...post,
          score: matchScore,
          snippet: this.highlightSnippet(post.text, tokens)
        });
      }
    }

    // Search Messages
    for (const msg of this.messages) {
      const matchScore = this.calculateScore(msg.text, `${msg.sender} ${msg.recipient}`, tokens);
      if (matchScore > 0) {
        results.push({
          ...msg,
          score: matchScore,
          snippet: this.highlightSnippet(msg.text, tokens)
        });
      }
    }

    // Sort by highest score, then newest
    return results.sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp));
  }

  calculateScore(content, metadata, tokens) {
    let score = 0;
    const contentLower = content.toLowerCase();
    const metaLower = metadata.toLowerCase();

    for (const token of tokens) {
      if (!token) continue;
      if (contentLower.includes(token)) {
        score += 10;
        try {
          const safeToken = escapeRegExp(token);
          const regex = new RegExp(safeToken, 'gi');
          const matches = contentLower.match(regex);
          if (matches) score += matches.length * 2;
        } catch (e) {
          score += 2;
        }
      }
      if (metaLower.includes(token)) {
        score += 5;
      }
    }
    return score;
  }

  highlightSnippet(text, tokens) {
    let snippet = text;
    for (const token of tokens) {
      if (!token) continue;
      try {
        const safeToken = escapeRegExp(token);
        const regex = new RegExp(`(${safeToken})`, 'gi');
        snippet = snippet.replace(regex, '<mark>$1</mark>');
      } catch (e) {
        // Fallback safely if regex fails
      }
    }
    return snippet;
  }
}

export const localSearchIndex = new ClientSearchIndex();
