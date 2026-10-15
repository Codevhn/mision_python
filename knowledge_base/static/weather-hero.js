/* Shared weather renderer: Home's sky or Horizonte's full-viewport landscape. */
(() => {
  'use strict';
  const preferenceKey='atlas_weather_animation';
  window.AtlasWeatherHero={mount(hero,canvas,condition,options={}){
    if (!hero || !canvas || !condition) return ()=>{};
    const ctx=canvas.getContext('2d');
    if (!ctx) return ()=>{};
    const kind=condition.replace(/-(day|night)$/,''), night=condition.endsWith('-night');
    const landscape=Boolean(options.landscape);
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
    // Paint shaded cloud silhouettes once, then move the cached layers.
    // Their scalloped tops and flat, dark bases distinguish clouds from fog.
    function cloudSprite(index){
      const sprite=document.createElement('canvas');sprite.width=640;sprite.height=240;
      const c=sprite.getContext('2d'), storm=['rain','thunderstorm','overcast','snow'].includes(kind);
      const shape=new Path2D();
      shape.moveTo(35,175);
      shape.bezierCurveTo(3,150,30,116,74,123);
      shape.bezierCurveTo(53,77,106,49,155,76);
      shape.bezierCurveTo(170,15,245,7,282,56);
      shape.bezierCurveTo(312,24,372,43,381,83);
      shape.bezierCurveTo(419,51,479,72,484,114);
      shape.bezierCurveTo(547,87,588,119,572,147);
      shape.bezierCurveTo(628,138,646,180,601,191);
      shape.bezierCurveTo(492,218,147,218,35,175);shape.closePath();
      c.save();c.filter=`blur(${index%2?4:2}px)`;
      const base=c.createLinearGradient(0,20,0,225);
      const colors=night?['#8c9aaf','#4a5c77','#26384f']:storm?['#e2e8ea','#a2b2bd','#556f83']:['#fffdf5','#e7f0f5','#a8c3d7'];
      colors.forEach((color,i)=>base.addColorStop(i/2,color));
      c.fillStyle=base;c.fill(shape);c.restore();
      c.save();c.clip(shape);
      // Unequal light pockets give the shared silhouette an illuminated crown.
      for(let j=0;j<6;j++){
        const x=90+j*85,y=75+Math.sin(j*2+index)*24;
        const light=c.createRadialGradient(x,y,2,x,y,87);
        light.addColorStop(0,`rgba(255,251,237,${night?.08:storm?.18:.35})`);
        light.addColorStop(1,'rgba(255,251,237,0)');c.fillStyle=light;c.fillRect(0,0,640,240);
      }
      // Low-frequency vapour texture breaks up the otherwise polished surface.
      const texture=document.createElement('canvas');texture.width=160;texture.height=60;
      const t=texture.getContext('2d'), pixels=t.createImageData(160,60);
      const noise=(x,y)=>{
        const n=Math.sin(x*127.1+y*311.7+index*73.9)*43758.5453;
        return n-Math.floor(n);
      };
      const smooth=(x,y,step)=>{
        const gx=Math.floor(x/step),gy=Math.floor(y/step);
        let u=x/step-gx,v=y/step-gy;u=u*u*(3-2*u);v=v*v*(3-2*v);
        return (noise(gx,gy)*(1-u)+noise(gx+1,gy)*u)*(1-v)
          +(noise(gx,gy+1)*(1-u)+noise(gx+1,gy+1)*u)*v;
      };
      for(let y=0;y<60;y++)for(let x=0;x<160;x++){
        const n=smooth(x,y,16)*.55+smooth(x,y,7)*.3+smooth(x,y,3)*.15;
        const offset=(y*160+x)*4,shade=n>.5?255:25;
        pixels.data[offset]=shade;pixels.data[offset+1]=shade;pixels.data[offset+2]=shade;
        pixels.data[offset+3]=Math.abs(n-.5)*130;
      }
      t.putImageData(pixels,0,0);c.drawImage(texture,0,0,640,240);
      c.restore();return sprite;
    }
    const clouds=Array.from({length:kind==='clear'?2:9},(_,i)=>({
      x:(i*.37)%1.5-.25,y:[-.28,.04,.38][i%3],
      scale:kind==='clear'?.35:[.68,1,.48][i%3],opacity:kind==='clear'?.42:[.65,.94,.44][i%3],sprite:cloudSprite(i)
    }));
    const stars=Array.from({length:60},()=>({x:Math.random(),y:Math.random()*.75,r:.4+Math.random(),phase:Math.random()*6}));
    const drops=Array.from({length:100},()=>({x:Math.random(),y:Math.random(),speed:.5+Math.random()*.6,len:7+Math.random()*12}));
    let terrain=null;
    function buildTerrain(){
      terrain=document.createElement('canvas');terrain.width=canvas.width;terrain.height=canvas.height;
      const t=terrain.getContext('2d');t.scale(dpr,dpr);
      const wet=['rain','thunderstorm','foggy','overcast'].includes(kind), snow=kind==='snow';
      const palette=night?['#465975','#2c425d','#192f45','#0d2432']:wet?['#839aa6','#607f8c','#355d65','#163e46']:['#9dbbbd','#698e88','#43775f','#204e3e'];
      const ridges=[
        [[0,.56],[.08,.48],[.16,.52],[.27,.36],[.35,.47],[.43,.42],[.55,.58],[.65,.5],[.74,.39],[.82,.47],[.9,.38],[1,.53]],
        [[0,.68],[.13,.52],[.2,.6],[.33,.48],[.4,.57],[.52,.68],[.65,.55],[.76,.61],[.87,.48],[1,.64]],
        [[0,.78],[.14,.69],[.29,.73],[.43,.82],[.6,.78],[.79,.66],[1,.73]]
      ];
      ridges.forEach((ridge,i)=>{
        t.beginPath();t.moveTo(0,height);
        ridge.forEach(([x,y])=>t.lineTo(x*width,y*height));t.lineTo(width,height);t.closePath();
        const fill=t.createLinearGradient(0,height*.4,0,height);
        fill.addColorStop(0,palette[i]);fill.addColorStop(1,palette[Math.min(i+1,3)]);
        t.fillStyle=fill;t.fill();
        if(i<2)ridge.slice(1,-1).forEach(([x,y],j)=>{
          if(y>=ridge[j][1]||y>=ridge[j+2][1])return;
          t.beginPath();t.moveTo(x*width,y*height);t.lineTo((x+.035)*width,(y+.12)*height);
          t.lineTo((x-.025)*width,(y+.075)*height);t.closePath();
          t.fillStyle=snow?(night?'#b0c3d4':'#e5edf0'):(night?'#8297af22':'#d8e3dc35');t.fill();
        });
      });
      if(wet){
        const mist=t.createLinearGradient(0,height*.46,0,height*.83);
        mist.addColorStop(0,'rgba(185,207,214,0)');mist.addColorStop(.55,`rgba(185,207,214,${kind==='foggy'?.4:.14})`);mist.addColorStop(1,'rgba(185,207,214,0)');
        t.fillStyle=mist;t.fillRect(0,height*.46,width,height*.37);
      }
      // A quiet river opens the valley; nearer wooded slopes frame it.
      t.beginPath();t.moveTo(width*.53,height*.79);t.bezierCurveTo(width*.46,height*.86,width*.7,height*.89,width*.55,height);
      t.lineTo(width*.79,height);t.bezierCurveTo(width*.79,height*.9,width*.51,height*.85,width*.55,height*.79);t.closePath();
      const water=t.createLinearGradient(0,height*.78,0,height);water.addColorStop(0,night?'#839bb4':'#c6dce0');water.addColorStop(1,night?'#2a4a64':'#5d9ca6');t.fillStyle=water;t.fill();
      for(const side of [0,1]){
        t.beginPath();t.moveTo(side?width:0,height*.83);
        t.bezierCurveTo(width*(side?.85:.13),height*.8,width*(side?.8:.28),height*.94,width*(side?.76:.41),height);
        t.lineTo(side?width:0,height);t.closePath();t.fillStyle=snow?(night?'#657e8c':'#c9d8d9'):palette[3];t.fill();
        for(let i=0;i<45;i++){
          const x=width*(side? .82+i/250:.18-i/250), y=height*(.85+Math.sin(i*1.7)*.018+i*.002),size=height*(.018+(i%5)*.003);
          t.fillStyle=night?'#091e2a':wet?'#163b3f':'#1b4944';
          t.fillRect(x-1,y,2,size);t.beginPath();t.moveTo(x,y-size);t.lineTo(x-size*.4,y+size*.3);t.lineTo(x+size*.4,y+size*.3);t.closePath();t.fill();
        }
      }
    }
    function draw(){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      if(night && ['clear','partly-cloudy'].includes(kind)){
        stars.slice(0,small()?28:60).forEach(p=>{
          ctx.beginPath();ctx.arc(p.x*width,p.y*height,p.r,0,Math.PI*2);
          ctx.fillStyle=`rgba(236,244,255,${.35+.3*(1+Math.sin(time*.5+p.phase))/2})`;ctx.fill();
        });
      }
      if(kind!=='clear' || !night){
        clouds.forEach((p,i)=>{
          const span=Math.max(small()?310:470,width*.48)*p.scale;
          const travel=width+span*2;
          const x=((p.x*width+span+time*(3+i*.35))%travel+travel)%travel-span;
          const y=p.y*height;
          ctx.save();ctx.globalAlpha=p.opacity;
          if(kind==='foggy'){
            ctx.globalAlpha=.22;ctx.filter='blur(16px)';
            ctx.drawImage(p.sprite,x,y,span*1.7,span*.24);
          }else ctx.drawImage(p.sprite,x,y,span,span*.375);
          ctx.restore();
        });
      }
      if(landscape && terrain)ctx.drawImage(terrain,0,0,width,height);
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
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(landscape)buildTerrain();draw();
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
