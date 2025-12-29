import React, { useEffect, useRef } from 'react';

const DutchieEmbed: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = 'dutchie--embed__script';

    // Ensure the script is only added if not already present
    if (!document.getElementById(scriptId) && containerRef.current) {
      const script = document.createElement('script') as unknown as HTMLScriptElement;
      script.async = true;
      script.id = scriptId;
      script.src = 'https://dutchie.com/api/v2/embedded-menu/64ba99806b283d00099e9638.js';

      // Append the script to the container
      containerRef.current.appendChild(script);
    }

    // Check and remove extra iframes with the class "dutchie--iframe"
    const removeExtraIframes = () => {
      if (containerRef.current) {
        const iframes = containerRef.current.querySelectorAll('iframe.dutchie--iframe');
        if (iframes.length > 1) {
          console.log(`Found ${iframes.length} 'dutchie--iframe' elements, removing extras.`);
          // Keep the first iframe and remove the rest
          for (let i = 1; i < iframes.length; i++) {
            iframes[i].remove();
          }
        }
      }
    };

    // Function to adjust iframe styles after it loads
    const adjustIframeStyles = () => {
      if (containerRef.current) {
        const iframe = containerRef.current.querySelector('iframe.dutchie--iframe') as unknown as HTMLScriptElement;
        if (iframe) {
          iframe.style.position = 'relative';
          iframe.style.height = '100%';
          iframe.style.width = '100%';
          iframe.style.top = '0';
          iframe.style.left = '0';
        }
      }
    };

    // Add an event listener to adjust styles after the iframe loads
    const iframeLoadTimeout = setTimeout(adjustIframeStyles, 1000);

    // Run cleanup after a delay to ensure the script completes rendering
    const cleanupTimeout = setTimeout(removeExtraIframes, 1000);

    // Cleanup function to remove the embed content on unmount
    return () => {
      clearTimeout(cleanupTimeout);
      clearTimeout(iframeLoadTimeout);
      if (containerRef.current) {
        containerRef.current.innerHTML = ''; // Clear the container
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="rounded-lg shadow-lg bg-white overflow-auto mx-auto"
      style={{
        position: 'relative', // Ensure the container is positioned relatively
        height: '100%',       // Adjust as needed
        width: '100%',        // Adjust as needed
        maxHeight: '100vh', // Adjust as needed
      }}
    ></div>
  );
};

export default DutchieEmbed;
