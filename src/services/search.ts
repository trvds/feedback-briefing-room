export interface SearchResult {
  id: string;
  score: number;
  metadata?: any;
}

export class AISearchService {
  constructor(private search: any) { }

  /**
   * Index feedback content for semantic search
   */
  async indexFeedback(feedbackId: number, content: string, metadata?: any): Promise<void> {
    try {
      await this.search.upsert({
        id: feedbackId.toString(),
        values: [], // AI Search handles embedding automatically
        metadata: {
          content,
          ...metadata
        }
      });
    } catch (error) {
      console.error("Indexing error:", error);
      // Fail silently for now - AI Search might not be fully configured
    }
  }

  /**
   * Find similar feedback items using semantic search
   */
  async findSimilarFeedback(query: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      const results = await this.search.query({
        query,
        top: limit,
        return_metadata: true
      });

      return results.matches?.map((match: any) => ({
        id: match.id,
        score: match.score || 0,
        metadata: match.metadata
      })) || [];
    } catch (error) {
      console.error("Search error:", error);
      // Return empty results if search fails
      return [];
    }
  }

  /**
   * Cluster feedback by themes using semantic search
   */
  async clusterFeedback(feedbackItems: Array<{ id: number; content: string }>): Promise<Array<{ theme: string; items: number[] }>> {
    try {
      // For clustering, we'll use the first item as a seed and find similar ones
      const clusters: Array<{ theme: string; items: number[] }> = [];
      const processed = new Set<number>();

      for (const item of feedbackItems) {
        if (processed.has(item.id)) continue;

        const similar = await this.findSimilarFeedback(item.content, 10);
        const clusterItems = similar
          .map(r => parseInt(r.id))
          .filter(id => feedbackItems.some(f => f.id === id));

        if (clusterItems.length > 0) {
          clusters.push({
            theme: item.content.substring(0, 100), // Use first 100 chars as theme
            items: clusterItems
          });

          clusterItems.forEach(id => processed.add(id));
        }
      }

      return clusters;
    } catch (error) {
      console.error("Clustering error:", error);
      return [];
    }
  }
}
