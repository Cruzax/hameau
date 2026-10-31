export function TitleBanner({ day }: { day: number }) {
  return (
    <div className="banner">
      <div className="banner__kicker">Hameau · Jour {day}</div>
      <h1 className="banner__title">Les agents ne parlent que le long des routes.</h1>
    </div>
  );
}
