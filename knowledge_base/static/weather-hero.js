/* Weather stays inside Home's header. No remote images, video or dependencies. */
(() => {
  'use strict';
  const preferenceKey='atlas_weather_animation';
  window.AtlasWeatherHero={mount(hero,canvas,condition){
    if (!hero || !canvas || !condition) return ()=>{};
    const ctx=canvas.getContext('2d');
    if (!ctx) return ()=>{};
    const kind=condition.replace(/-(day|night)$/,''), night=condition.endsWith('-night');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let enabled=true;
    try { enabled=localStorage.getItem(preferenceKey)!=='off'; } catch {}
    hero.dataset.weatherScene=condition;
    let scene=hero.querySelector('.weather-scene');
    if (!scene) {
      scene=document.createElement('div');scene.className='weather-scene';scene.setAttribute('aria-hidden','true');
      scene.innerHTML='<span class="weather-orb"></span><span class="weather-atmosphere"></span>';
      hero.prepend(scene);
    }
    let button=hero.querySelector('.weather-motion-toggle');
    if (!button) {
      button=document.createElement('button');button.type='button';button.className='weather-motion-toggle';
      button.setAttribute('aria-label','Animación del clima');
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6"/></svg>';
      hero.append(button);
    }
    let width=1,height=1,dpr=1,raf=0,last=0,time=0,visible=false,disposed=false;
    const small=()=>innerWidth<768;
    const clouds=Array.from({length:kind==='clear'?2:7},(_,i)=>({x:kind==='clear'?(i+.8)/3:i/7,y:.12+(i%3)*.13,size:.14+(i%4)*.035}));
    const stars=Array.from({length:60},()=>({x:Math.random(),y:Math.random()*.75,r:.4+Math.random(),phase:Math.random()*6}));
    const drops=Array.from({length:100},()=>({x:Math.random(),y:Math.random(),speed:.5+Math.random()*.6,len:7+Math.random()*12}));
    function draw(){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      if(night && ['clear','partly-cloudy'].includes(kind)){
        stars.slice(0,small()?28:60).forEach(p=>{
          ctx.beginPath();ctx.arc(p.x*width,p.y*height,p.r,0,Math.PI*2);
          ctx.fillStyle=`rgba(236,244,255,${.35+.3*(1+Math.sin(time*.5+p.phase))/2})`;ctx.fill();
        });
      }
      if(kind!=='clear' || !night){
        clouds.slice(0,small()?4:7).forEach((p,i)=>{
          const x=((p.x+time*(.003+i*.00025))%1.5-.25)*width, y=p.y*height;
          const size=Math.max(65,p.size*width);
          const fog=kind==='foggy';
          ctx.save();ctx.translate(x,y);ctx.scale(1,fog?.3:.42);
          const g=ctx.createRadialGradient(0,0,0,0,0,size);
          const alpha=night?.18:kind==='clear'?.3:.55;
          g.addColorStop(0,`rgba(${night?'143,164,193':'244,247,247'},${alpha})`);
          g.addColorStop(1,'rgba(220,232,240,0)');ctx.fillStyle=g;
          ctx.beginPath();ctx.ellipse(0,0,size,size,0,0,Math.PI*2);ctx.fill();ctx.restore();
        });
      }
      if(['rain','thunderstorm','snow'].includes(kind)){
        drops.slice(0,small()?35:kind==='snow'?55:100).forEach(p=>{
          const x=(p.x*width-time*(kind==='snow'?8:28)*p.speed)%(width+24);
          const y=(p.y*height+time*(kind==='snow'?20:230)*p.speed)%(height+24)-12;
          if(kind==='snow'){
            ctx.beginPath();ctx.arc((x+width+24)%(width+24),y,1.1+p.speed,0,Math.PI*2);
            ctx.fillStyle='rgba(242,247,255,.7)';ctx.fill();
          } else {
            const px=(x+width+24)%(width+24);ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(px-3,y+p.len);
            ctx.strokeStyle=`rgba(197,225,247,${kind==='thunderstorm'?.6:.45})`;ctx.lineWidth=.9;ctx.stroke();
          }
        });
      }
      // A slow, local glow instead of flashing the screen or drawing lightning.
      if(kind==='thunderstorm'){
        const glow=Math.max(0,Math.sin(time*.38)-.87)*.35;
        const g=ctx.createRadialGradient(width*.75,height*.1,0,width*.75,height*.1,width*.35);
        g.addColorStop(0,`rgba(206,216,242,${glow})`);g.addColorStop(1,'rgba(206,216,242,0)');
        ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
      }
    }
    function frame(stamp){
      raf=0;if(disposed)return;
      if(stamp-last>=1000/(small()?20:30)){
        time+=Math.min((stamp-last)/1000,.1);last=stamp;draw();
      }
      raf=requestAnimationFrame(frame);
    }
    function sync(){
      cancelAnimationFrame(raf);raf=0;
      const moving=enabled&&!reduced.matches&&visible&&!document.hidden&&!disposed;
      hero.dataset.weatherMotion=moving?'running':'still';
      button.setAttribute('aria-pressed',String(enabled&&!reduced.matches));
      button.disabled=reduced.matches;
      button.title=reduced.matches?'Movimiento reducido en la configuración de tu sistema':enabled?'Pausar animación del clima':'Activar animación del clima';
      if(moving){last=performance.now();raf=requestAnimationFrame(frame);}else draw();
    }
    function resize(){
      width=Math.max(1,hero.clientWidth);height=Math.max(1,hero.clientHeight);
      dpr=Math.min(devicePixelRatio||1,small()?1:1.5);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();
    }
    function toggle(){enabled=!enabled;try{localStorage.setItem(preferenceKey,enabled?'on':'off');}catch{}sync();}
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(hero);
    const sizing=new ResizeObserver(resize);sizing.observe(hero);
    document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);button.addEventListener('click',toggle);
    resize();sync();
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);observer.disconnect();sizing.disconnect();
      document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);button.removeEventListener('click',toggle);
      hero.dataset.weatherMotion='still';
    };
  }};
})();
