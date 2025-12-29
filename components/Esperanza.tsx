'use client'
import { useEffect, useRef } from 'react';

function EsperanzaC() {
  const containerRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script') as unknown as HTMLScriptElement;
  
    script.src = "https://agent.d-id.com/v1/index.js";
    script.async = true;
    script.type = "module";
    script.dataset.name = "did-agent";
    script.dataset.mode = "fabio";
    script.dataset.clientKey = "Z29vZ2xlLW9hdXRoMnwxMDg3MTk3NDQ4NzMzMjM5MTM1MTg6aHRmOXI5aTJtUF9mV0FKbE80TzNk";
    script.dataset.agentId = "agt_LVeWH6aT";
  
    document.head.appendChild(script);
  
    return () => {
      document.head.removeChild(script);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
      }}
    />
  );
}

export default EsperanzaC;