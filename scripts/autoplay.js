// Auto-play script for testing
// Usage in console: autoPlay() to start, stopAutoPlay() to stop

(function() {
  let intervalId = null;
  
  function autoPlay(speed = 800) {
    if (intervalId) {
      console.log("Already running. Call stopAutoPlay() first.");
      return;
    }
    
    intervalId = setInterval(() => {
      const msg = document.querySelector('#message')?.textContent || "";
      
      // Check game over
      if (msg.includes('wins')) {
        console.log("Game over! Restarting...");
        setTimeout(() => {
          document.getElementById('restart-btn')?.click();
        }, 1000);
        return;
      }
      
      // Check if it's opponent's turn (AI) - just wait
      if (msg.includes('Opponent')) {
        return;
      }
      
      // Draw phase
      if (msg.includes('draw from deck or discard')) {
        document.getElementById('draw-pile')?.dispatchEvent(
          new MouseEvent('dblclick', {bubbles: true})
        );
        return;
      }
      
      // Discard phase
      if (msg.includes('discard') || msg.includes('Discard')) {
        // Try lay down first
        document.getElementById('laydown-btn')?.click();
        
        // Then discard first card
        setTimeout(() => {
          const cards = document.querySelectorAll('#your-hand .card');
          if (cards.length > 0) {
            cards[0].dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
          }
        }, 100);
        return;
      }
    }, speed);
    
    console.log(`Auto-play started (${speed}ms interval). Call stopAutoPlay() to stop.`);
  }
  
  function stopAutoPlay() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("Auto-play stopped.");
    } else {
      console.log("Auto-play not running.");
    }
  }
  
  // Expose globally
  window.autoPlay = autoPlay;
  window.stopAutoPlay = stopAutoPlay;
  
  console.log("Auto-play ready. Call autoPlay() to start.");
})();
