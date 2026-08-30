/**
 * Client-Side Zero-Knowledge Full-Text Search Engine
 * Runs 100% in-memory on device. Zero search queries or keywords leave the client.
 */

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class ClientSearchIndex {
  constructor() {
    this.posts = [];
    this.messages = [];
    this.groupMessages = [];
  }

  clear() {
    this.posts = [];
    this.messages = [];
    this.groupMessages = [];
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

  indexGroupMessage(id, groupId, groupName, sender, decryptedText, timestamp) {
    if (!id || !decryptedText) return;
    this.groupMessages = this.groupMessages.filter(m => m.id !== id);
    this.groupMessages.push({
      id,
      groupId,
      groupName,
      sender,
      text: decryptedText,
      timestamp,
      type: 'group'
    });
  }

  search(query, category = 'all') {
    if (!query || !query.trim()) return [];
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

    const results = [];

    // Search Posts
    if (category === 'all' || category === 'posts') {
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
    }

    // Search DMs
    if (category === 'all' || category === 'messages') {
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
    }

    // Search Group Messages
    if (category === 'all' || category === 'groups') {
      for (const gm of this.groupMessages) {
        const matchScore = this.calculateScore(gm.text, `${gm.sender} ${gm.groupName}`, tokens);
        if (matchScore > 0) {
          results.push({
            ...gm,
            score: matchScore,
            snippet: this.highlightSnippet(gm.text, tokens)
          });
        }
      }
    }

    // Sort by highest relevance score, then newest timestamp
    return results.sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp));
  }

  calculateScore(content, metadata, tokens) {
    let score = 0;
    const contentLower = content.toLowerCase();
    const metaLower = (metadata || '').toLowerCase();

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
    if (!text) return '';
    let snippet = text.slice(0, 140);
    for (const token of tokens) {
      if (!token) continue;
      try {
        const safeToken = escapeRegExp(token);
        const regex = new RegExp(`(${safeToken})`, 'gi');
        snippet = snippet.replace(regex, '<mark class="search-hl">$1</mark>');
      } catch (e) {}
    }
    return snippet + (text.length > 140 ? '...' : '');
  }
}

export const localSearchIndex = new ClientSearchIndex();
