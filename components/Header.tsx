'use client'
import { useState, useEffect } from 'react'
import { Dialog } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import dynamic from 'next/dynamic'
const Wallet = dynamic(() => import('./Connect'), { ssr: false })
import Head from 'next/head'

// Define MONO_FONT_FAMILY for use in styled-jsx or direct styling
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

const navigation = [
  { name: 'Collection', href: 'https://digibazaar.io/ethereum/collection/0xc55b865a686d19eb0490fb9237cba0ba49e73374' },
  { name: 'Whitepaper', href: 'https://na2.documents.adobe.com/public/esignWidget?wid=CBFCIBAA3AAABLblqZhCNdX-YdRqatZQAdl5Mqdkhnnd8z31YujH2iIEcPJSrSr0tPI0Y2cog_5d17HU8z1g*' },
  { name: 'About Us', href: 'https://requiem-electric.com/' },
]

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tapSoundEffect, setTapSoundEffect] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio('/static/sounds/tap.mp3');
    setTapSoundEffect(audio);
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  return (
    <>
      <Head>
        <meta name="theme-color" content="#1F2937" /> {/* Darker theme color */}
      </Head>
      <header className="z-50" style={{
        fontFamily: MONO_FONT_FAMILY, // Apply mono font to header context
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(17, 24, 39, 0.8)', // Dark gray, semi-transparent (bg-gray-900 at 80%)
        borderBottom: '1px solid rgba(55, 65, 81, 0.7)', // Darker border (border-gray-700 at 70%)
      }}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 lg:px-6" aria-label="Global"> {/* Adjusted padding */}
          <div className="flex flex-1">
            <div className="hidden lg:flex lg:gap-x-10"> {/* Adjusted gap */}
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="text-xs font-semibold leading-6 text-neutral-300 hover:text-white transition-colors duration-150"
                  style={{ fontFamily: MONO_FONT_FAMILY }}
                >
                  {item.name}
                </a>
              ))}
            </div>
            <div className="flex lg:hidden">
              <button
                type="button"
                className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-neutral-300 hover:text-white"
                onClick={() => {
                  if (tapSoundEffect) { tapSoundEffect.play(); }
                  setMobileMenuOpen(true);
                }}
              >
                <span className="sr-only">Open main menu</span>
                <Bars3Icon className="h-5 w-5" aria-hidden="true" /> {/* Slightly smaller icon */}
              </button>
            </div>
          </div>
          <a href="#" className="-m-1.5 p-1.5">
            <span className="sr-only">The Utility Company</span>
            <img className="h-12 w-auto lg:h-14" src="/Medallions/TUC.png" alt="" /> {/* Slightly smaller logo on mobile */}
          </a>
          <div className="hidden lg:flex flex-1 justify-end">
            <div className="text-xs font-semibold leading-6 text-neutral-300 hover:text-white transition-colors duration-150" style={{ fontFamily: MONO_FONT_FAMILY }}>
              <Wallet tooltipDirection="top" /> <span aria-hidden="true"></span>
            </div>
          </div>
        </nav>
        <Dialog className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <div className="fixed inset-0 z-50 bg-black/30" /> {/* Darker overlay for consistency */}
          <Dialog.Panel className="fixed inset-y-0 left-0 z-50 w-full overflow-y-auto px-6 py-6"
            style={{
              fontFamily: MONO_FONT_FAMILY,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              backgroundColor: 'rgba(17, 24, 39, 0.95)', // Darker, more opaque for readability
              borderRight: '1px solid rgba(55, 65, 81, 0.7)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-1">
                <div className="text-sm font-semibold leading-6 text-gray-900">
                  <Wallet />
                </div>
                <button
                  type="button"
                  className="-m-2.5 rounded-md p-2.5 text-neutral-300 hover:text-white"
                  onClick={() => {
                    tapSoundEffect?.play();
                    setMobileMenuOpen(false);
                  }}
                >
                  <span className="sr-only">Close menu</span>
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" /> {/* Slightly smaller icon */}
                </button>
              </div>
              <a href="#" className="-m-1.5 p-1.5">
                <span className="sr-only">Invisible Enemies</span>
                <img className="h-12 w-auto" src="/Medallions/MKVLI.png" alt="" />
              </a>
            </div>
            <div className="mt-6 space-y-2">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="-mx-3 block rounded-lg px-3 py-2 text-xs font-semibold leading-6 text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors duration-150"
                  style={{ fontFamily: MONO_FONT_FAMILY }}
                >
                  {item.name}
                </a>
              ))}
            </div>
            <div className="mt-6 flex flex-1 justify-center">
              <div className="text-xs font-semibold leading-6 text-neutral-300 hover:text-white transition-colors duration-150" style={{ fontFamily: MONO_FONT_FAMILY }}>
                <Wallet tooltipDirection="top" /> <span aria-hidden="true"></span>
              </div>
            </div>
          </Dialog.Panel>
        </Dialog>
      </header>
    </>
  )
}