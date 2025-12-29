'use client';
import { useState, useEffect } from 'react';
import { ChevronDownIcon, ArrowTopRightOnSquareIcon, AcademicCapIcon, BookOpenIcon, GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import parse from 'html-react-parser';
import { FaMedium, FaXTwitter, FaDiscord } from 'react-icons/fa6';

const MEDIUM_RSS_URL = 'https://medium.com/feed/@info_89050';
const PLACEHOLDER_IMAGE = '/TSPBanner9.png';
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

export default function LearnPanel() {
  const [mediumArticles, setMediumArticles] = useState<any[]>([]);
  const [expandedTileMedium, setExpandedTileMedium] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMediumPosts = async () => {
      try {
        const response = await axios.get(
          `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(MEDIUM_RSS_URL)}`
        );
        setMediumArticles(response.data.items);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching Medium feed:', error);
        setLoading(false);
      }
    };
    fetchMediumPosts();
  }, []);

  const extractFirstImage = (htmlString: string) => {
    const imgTag = htmlString.match(/<img[^>]+src="([^">]+)"/);
    return imgTag ? imgTag[1] : null;
  };

  const removeFirstImageOrFigure = (htmlString: string) => {
    return htmlString.replace(/<figure[^>]*>.*?<\/figure>|<img[^>]+>/, '');
  };

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
      {/* --- HERO OVERVIEW SECTION --- */}
      <div className="relative group rounded-3xl overflow-hidden min-h-[320px] ultra-glass border border-white/10 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-transparent to-purple-500/10 opacity-60 group-hover:opacity-100 transition-opacity duration-700" />

        {/* Animated Grid Background */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />

        <div className="relative h-full flex flex-col md:flex-row items-center p-8 md:p-12 gap-8 z-10">
          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">Knowledge Protocol Active</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-sans font-light tracking-tight text-white leading-tight">
              Mastering the <span className="text-emerald-400 font-medium">Renaissance</span> Ledger
            </h1>

            <p className="text-zinc-400 font-mono text-sm max-w-2xl leading-relaxed">
              Synthesizing the future of decentralized finance, autonomous robotics, and geometric sovereignty. Explore our documentation, research papers, and technical updates.
            </p>

            <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4">
              <a href="https://discord.gg/q4tFymyAnx" target="_blank" className="px-6 py-2.5 rounded-full bg-white text-black font-bold text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-xl shadow-white/5">
                <FaDiscord size={14} /> Join Society
              </a>
              <a href="https://x.com/RENSNCEDAO" target="_blank" className="px-6 py-2.5 rounded-full glass-card border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/5 hover:border-white/20 transition-all flex items-center gap-2">
                <FaXTwitter size={14} /> Intelligence
              </a>
            </div>
          </div>

          <div className="w-full md:w-[40%] aspect-video md:aspect-square relative rounded-2xl overflow-hidden border border-white/5 shadow-2xl group/img">
            <img src="/TSPBanner9.png" className="w-full h-full object-cover transition-transform duration-1000 group-hover/img:scale-110" alt="Protocol Banner" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        </div>
      </div>

      {/* --- QUICK ACCESS GRID --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: AcademicCapIcon, label: 'Theory', color: 'text-amber-400', href: '#' },
          { icon: BookOpenIcon, label: 'Whitepaper', color: 'text-emerald-400', href: 'https://rensnce.com/whitepaper' },
          { icon: GlobeAltIcon, label: 'Ecosystem', color: 'text-blue-400', href: 'https://rensnce.com/token' },
          { icon: ShieldCheckIcon, label: 'Audit', color: 'text-purple-400', href: 'https://rensnce.com/audit' },
        ].map((item, i) => (
          <a key={i} href={item.href} target="_blank" rel="noopener noreferrer" className="glass-card-light rounded-2xl p-6 flex flex-col items-center gap-3 group hover:border-white/20 transition-all cursor-pointer">
            <item.icon className={`w-8 h-8 ${item.color} opacity-80 group-hover:scale-110 transition-transform`} />
            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 group-hover:text-white transition-colors">{item.label}</span>
          </a>
        ))}
      </div>

      {/* --- RESEARCH FEED GRID --- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 font-mono">Intelligence Archive</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600 font-mono">Powered by Medium</span>
            <FaMedium className="text-zinc-600" />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mediumArticles.map((article, index) => {
              const firstImage = extractFirstImage(article.description);
              const isExpanded = expandedTileMedium === index;

              return (
                <div
                  key={index}
                  className={`group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-500 border border-white/5 shadow-xl glass-card hover:border-emerald-500/30 ${isExpanded ? 'lg:col-span-2 row-span-2' : ''}`}
                >
                  {/* Article Artwork */}
                  <div className={`relative overflow-hidden ${isExpanded ? 'h-64' : 'h-48'}`}>
                    <img
                      src={firstImage || PLACEHOLDER_IMAGE}
                      className={`w-full h-full object-cover transition-transform duration-700 ${isExpanded ? '' : 'group-hover:scale-105 saturate-[0.8] group-hover:saturate-100'}`}
                      alt={article.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/40 to-transparent" />

                    {/* Date/Tag */}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-mono text-emerald-400 uppercase tracking-widest">Research Item</span>
                    </div>

                    <button
                      onClick={() => article.link && window.open(article.link, '_blank')}
                      className="absolute top-4 right-4 p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/40 hover:text-white transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className={`font-sans font-light tracking-tight text-white mb-4 group-hover:text-emerald-300 transition-colors ${isExpanded ? 'text-3xl' : 'text-xl'}`}>
                      {article.title}
                    </h3>

                    {isExpanded ? (
                      <div className="flex-1 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="text-zinc-400 font-mono text-sm leading-relaxed article-content mb-8">
                          {parse(removeFirstImageOrFigure(article.description))}
                        </div>
                        <div className="flex justify-between items-center mt-auto pt-6 border-t border-white/5">
                          <button
                            onClick={() => setExpandedTileMedium(null)}
                            className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 hover:text-white transition-colors"
                          >
                            Close Archive
                          </button>
                          <a
                            href={article.link}
                            target="_blank"
                            className="px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all"
                          >
                            Read Full Thesis
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-auto flex justify-between items-center">
                        <span className="text-[10px] font-mono text-zinc-600">{new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <button
                          onClick={() => setExpandedTileMedium(index)}
                          className="text-[10px] uppercase font-mono tracking-widest text-emerald-500 font-bold hover:text-emerald-400 flex items-center gap-1 transition-colors group-hover:gap-2"
                        >
                          Synthesize <ChevronDownIcon className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        .article-content p, .article-content li, .article-content span {
          margin-bottom: 1rem;
          line-height: 1.8;
          color: rgba(212, 212, 216, 0.9);
        }
        .article-content h1, .article-content h2, .article-content h3 {
          font-family: system-ui;
          font-weight: 300;
          color: #fafafa;
          margin: 2rem 0 1rem;
          letter-spacing: -0.02em;
        }
        .article-content h1 { font-size: 2rem; }
        .article-content h2 { font-size: 1.5rem; }
        .article-content h3 { font-size: 1.25rem; }
        .article-content a {
          color: #10b981;
          text-decoration: none;
          border-bottom: 1px dashed rgba(16, 185, 129, 0.4);
          transition: all 0.2s;
        }
        .article-content a:hover {
          color: #34d399;
          border-bottom-style: solid;
        }
        .article-content blockquote {
          border-left: 2px solid #10b981;
          padding-left: 1.5rem;
          font-style: italic;
          color: #a1a1aa;
          margin: 2rem 0;
        }
        .article-content img {
          border-radius: 1rem;
          margin: 2rem 0;
          border: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
}
