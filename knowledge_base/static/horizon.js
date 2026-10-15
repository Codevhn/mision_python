/* One landscape for the whole workspace; reuses the weather renderer and data. */
(() => {
  let host=null,stop=null,condition=null,active=false,refresh=null,button=null;
  function render(next){
    if(!active || (stop && next===condition))return;
    stop?.();condition=next;
    if(button)host.append(button);
    stop=window.AtlasWeatherHero.mount(host,host.querySelector('canvas'),next||'unknown-day',{landscape:true});
    button=host.querySelector('.weather-motion-toggle');
    button.classList.add('horizon-motion-toggle');
    const controls=document.querySelector('.topbar-right'),loginBar=document.querySelector('.login-topbar');
    if(controls)controls.prepend(button);
    else if(loginBar)loginBar.insertBefore(button,loginBar.lastElementChild);
    else document.body.append(button);
    host.dataset.weatherAvailable=String(Boolean(next));
  }
  window.AtlasHorizon={
    setEnabled(enabled){
      if(enabled===active)return;
      active=enabled;
      if(active){
        host=document.createElement('div');host.id='atlasHorizon';
        host.innerHTML='<canvas class="home-hero-canvas" aria-hidden="true"></canvas>';
        document.body.prepend(host);render(condition);
        refresh=setInterval(()=>{if(!document.hidden)document.dispatchEvent(new Event('atlas:weather-refresh'));},600000);
      }else{
        stop?.();stop=null;button?.remove();button=null;host?.remove();host=null;clearInterval(refresh);refresh=null;
      }
    },
    update(next){if(active)render(next);},
  };
})();
