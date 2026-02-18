import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config/env';
import logger from '../utils/logger';
import { DocumentMetadata } from '../types';

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  headings: string[];
  metadata: DocumentMetadata;
}

class ScraperService {
  private visited: Set<string> = new Set();
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.scraper.loginradiusDocsUrl;
  }

  async scrapeLoginRadiusDocs(maxPages: number = 50): Promise<ScrapedPage[]> {
    try {
      logger.info('Starting LoginRadius documentation scrape', { baseUrl: this.baseUrl, maxPages });

      // Reset visited set so re-scraping works
      this.visited.clear();

      const pages: ScrapedPage[] = [];
      const queue: string[] = [this.baseUrl];
      let depth = 0;

      while (queue.length > 0 && pages.length < maxPages && depth < config.scraper.maxDepth) {
        const url = queue.shift();
        if (!url || this.visited.has(url)) continue;

        this.visited.add(url);

        try {
          const page = await this.scrapePage(url);
          if (page) {
            pages.push(page);
            logger.info('Page scraped', { url, title: page.title });

            // Extract links for next pages
            const links = await this.extractLinks(url, page.content);
            queue.push(...links.filter(link => !this.visited.has(link) && link.startsWith(this.baseUrl)));
          }
        } catch (error) {
          logger.warn('Failed to scrape page', { url, error: String(error) });
        }

        // Rate limiting
        await this.delay(config.scraper.rateLimit);
      }

      logger.info('Documentation scraping complete', { totalPages: pages.length, depth });
      return pages;
    } catch (error) {
      logger.error('Error scraping LoginRadius docs', { error: String(error) });
      return [];
    }
  }

  private async scrapePage(url: string): Promise<ScrapedPage | null> {
    try {
      const response = await axios.get(url, {
        timeout: config.scraper.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (LoginRadius Chatbot Scraper)',
        },
      });

      const $ = cheerio.load(response.data);

      // Extract title
      const title = $('h1').first().text() || $('title').text() || url;

      // Extract main content - adjust selectors based on actual site structure
      let content = '';
      const contentSelectors = ['main', 'article', '.content', '.documentation', '[role="main"]'];
      let contentElement: cheerio.Cheerio<any> | null = null;

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          contentElement = element;
          break;
        }
      }

      if (!contentElement) {
        contentElement = $('body');
      }

      // Extract headings
      const headings: string[] = [];
      contentElement.find('h1, h2, h3').each((_: number, el: any) => {
        const text = $(el).text().trim();
        if (text) headings.push(text);
      });

      // Extract content while preserving code blocks
      content = this.extractContentWithCode($, contentElement);

      // Clean content (but preserve code blocks)
      content = this.cleanContent(content);

      if (!content) {
        return null;
      }

      return {
        url,
        title: title.trim(),
        content,
        headings,
        metadata: {
          source: url,
          category: this.extractCategory(url),
          version: this.extractVersion(content),
          url,
          lastUpdated: new Date(),
        },
      };
    } catch (error) {
      logger.warn('Failed to scrape page', { url, error: String(error) });
      return null;
    }
  }

  private async extractLinks(pageUrl: string, content: string): Promise<string[]> {
    try {
      const response = await axios.get(pageUrl, {
        timeout: config.scraper.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (LoginRadius Chatbot Scraper)',
        },
      });

      const $ = cheerio.load(response.data);
      const links: Set<string> = new Set();

      $('a[href]').each((_, el) => {
        let href = $(el).attr('href') || '';

        // Convert relative URLs to absolute
        if (href.startsWith('/')) {
          href = new URL(href, this.baseUrl).href;
        }

        // Only include docs links
        if (href.startsWith(this.baseUrl)) {
          links.add(href);
        }
      });

      return Array.from(links);
    } catch (error) {
      logger.warn('Failed to extract links', { url: pageUrl, error: String(error) });
      return [];
    }
  }

  /**
   * Extract content from HTML while preserving code blocks as markdown
   */
  private extractContentWithCode($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
    const parts: string[] = [];

    element.find('*').each((_: number, el: any) => {
      const tagName = (el as any).tagName?.toLowerCase();

      if (tagName === 'pre' || tagName === 'code') {
        const codeText = $(el).text().trim();
        if (codeText && codeText.length > 10) {
          // Try to detect language from class
          const className = $(el).attr('class') || '';
          const langMatch = className.match(/language-(\w+)|lang-(\w+)/);
          const lang = langMatch ? (langMatch[1] || langMatch[2]) : '';
          parts.push(`\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`);
        }
      } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const level = parseInt(tagName.charAt(1));
        const text = $(el).text().trim();
        if (text) {
          parts.push(`\n${'#'.repeat(level)} ${text}\n`);
        }
      } else if (tagName === 'p') {
        const text = $(el).text().trim();
        if (text) {
          parts.push(text + '\n');
        }
      } else if (tagName === 'li') {
        const text = $(el).text().trim();
        if (text) {
          parts.push(`- ${text}`);
        }
      }
    });

    // If parsing produced nothing, fall back to text extraction
    if (parts.length === 0) {
      return element.text();
    }

    return parts.join('\n');
  }

  private cleanContent(content: string): string {
    // Preserve code blocks: extract them, clean the rest, then put them back
    const codeBlocks: string[] = [];
    const placeholder = '___CODE_BLOCK___';
    content = content.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return placeholder;
    });

    // Clean non-code content: collapse whitespace
    content = content.replace(/[ \t]+/g, ' ');
    content = content.replace(/\n{3,}/g, '\n\n');

    // Remove common navigation/footer text
    const patterns = [
      /nav.*?\/nav/gi,
      /footer.*?\/footer/gi,
      /\(.*?previous.*?next.*?\)/gi,
    ];

    for (const pattern of patterns) {
      content = content.replace(pattern, '');
    }

    // Restore code blocks
    let blockIdx = 0;
    content = content.replace(new RegExp(placeholder, 'g'), () => {
      return codeBlocks[blockIdx++] || '';
    });

    return content.substring(0, 150000).trim(); // Higher limit to include code
  }

  private extractCategory(url: string): string {
    // Extract category from URL path
    const parts = url.split('/').filter(p => p);
    return parts[1] || 'documentation';
  }

  private extractVersion(content: string): string | undefined {
    // Try to extract version number
    const match = content.match(/version\s*:?\s*([\d.]+)/i);
    return match ? match[1] : undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset(): void {
    this.visited.clear();
  }
}

export const scraperService = new ScraperService();
export default ScraperService;
