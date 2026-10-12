// Pictograms of the exit checklist, drawn like the clothes of « Habiller Thomas »: 48×48, a light fill with a dark outline.
// The page colours them (CSS: --c the outline, --t the fill, --face the inner parts); class "no-fill" is a line only,
// "dot" a fat dot (eyes, buttons). Pictos.svg("biberon") gives the <svg>.
(function () {
  const line = (d) => `<path class="no-fill" d="${d}"/>`;
  const dots = (d) => `<path class="no-fill dot" d="${d}"/>`;
  const drop = (x, y, r) => `M${x} ${y - r * 2.1} Q${x + r} ${y - r * 0.7} ${x + r} ${y} A${r} ${r} 0 0 1 ${x - r} ${y} Q${x - r} ${y - r * 0.7} ${x} ${y - r * 2.1} Z`;
  const DIAPER = "M7 13 H41 Q41 33 24 40 Q7 33 7 13 Z";
  const P = {
    // Repas
    biberon: `<path d="M20.5 10.5 Q20.5 3.5 24 3.5 Q27.5 3.5 27.5 10.5 Z"/><path d="M16.5 10.5 H31.5 V16 H16.5 Z"/>`
      + `<path d="M18 16 H30 Q33.5 20 33.5 25 V40 Q33.5 44.5 29 44.5 H19 Q14.5 44.5 14.5 40 V25 Q14.5 20 18 16 Z"/>`
      + line("M19.5 26 H24 M19.5 31.5 H24 M19.5 37 H24"),
    nourrette: `<path d="M18.5 5 H29.5 V11 H18.5 Z"/><path d="M19.5 11 H28.5 Q33 14 33 19 V41 Q33 44.5 29.5 44.5 H18.5 Q15 44.5 15 41 V19 Q15 14 19.5 11 Z"/>`
      + `<path class="face" d="M15 22 H33 V38 H15 Z"/><path d="${drop(24, 32.5, 3.6)}"/>`,
    bavoir: `<path d="M12 7 Q8 7 8 11 V27 Q8 44 24 44 Q40 44 40 27 V11 Q40 7 36 7 H32.5 Q32 19 24 19 Q16 19 15.5 7 Z"/>`
      + line("M14 32 Q24 38 34 32") + dots("M11.5 11.5 v.01"),
    glace: `<path d="M10 11 H38 Q42 11 42 15 V35 Q42 39 38 39 H10 Q6 39 6 35 V15 Q6 11 10 11 Z"/>`
      + line("M24 16 V34 M16.2 20.5 L31.8 29.5 M16.2 29.5 L31.8 20.5 M21 16.5 L24 19 L27 16.5 M21 33.5 L24 31 L27 33.5"),
    tirelait: `<path d="M16 21 L6.5 12 Q3 17 3.5 23 Q4 29 7.5 32 L16 26.5 Z"/><path d="M15.5 20 H32 V27 H15.5 Z"/>`
      + `<path d="M17 27 H30.5 V40.5 Q30.5 44.5 26.5 44.5 H21 Q17 44.5 17 40.5 Z"/>` + line("M32 22 Q40.5 19.5 43 10.5 M21 33 H25 M21 38 H25"),
    lingeRot: `<path d="M24 5.5 Q36 3.5 38 11.5 Q39.5 18 34 24 Q39.5 30 38 36.5 Q36 44.5 24 42.5 Q12 44.5 10 36.5 Q8.5 30 14 24 Q8.5 18 10 11.5 Q12 3.5 24 5.5 Z"/>`
      + `<path class="no-fill dash" d="M24 10 Q32.5 8.5 33.5 13 Q34.5 18 29 24 Q34.5 30 33.5 35 Q32.5 39.5 24 38 Q15.5 39.5 14.5 35 Q13.5 30 19 24 Q13.5 18 14.5 13 Q15.5 8.5 24 10 Z"/>`,
    // Change
    changer: `<path d="M4.5 21 H31.5 Q31.5 37 18 43 Q4.5 37 4.5 21 Z"/>` + line("M4.5 26 H9.5 M26.5 26 H31.5")
      + line("M33 9.5 Q33 4 38.5 4 Q44 4 44 9.5 Q44 13 40.5 14.5 Q38.5 15.5 38.5 19") + dots("M38.5 24.5 v.01"),
    couche: `<path d="${DIAPER}"/>` + line("M7 19 H13 M35 19 H41") + dots("M19 26 v.01 M24 28 v.01 M29 26 v.01"),
    lingettes: `<path d="M6 19 Q6 15 10 15 H38 Q42 15 42 19 V37 Q42 41 38 41 H10 Q6 41 6 37 Z"/>`
      + `<path class="face" d="M17 19.5 H31 Q33.5 19.5 33.5 22 V24 Q33.5 26.5 31 26.5 H17 Q14.5 26.5 14.5 24 V22 Q14.5 19.5 17 19.5 Z"/>`
      + `<path d="M19.5 23 Q18 15 21.5 9 Q25 12.5 29 10 Q30 16 28.5 23 Z" class="face"/>`,
    creme: `<path d="M13 4.5 H35 V9.5 H13 Z"/><path d="M14 9.5 H34 Q33.5 22 29.5 32 H18.5 Q14.5 22 14 9.5 Z"/>`
      + `<path d="M20.5 32 H27.5 V35.5 H20.5 Z"/><path d="M19 35.5 H29 V43 Q29 44.5 27.5 44.5 H20.5 Q19 44.5 19 43 Z"/>` + line("M19 15.5 H29 M20 21 H28"),
    tapis: `<path d="M10.5 15 H37.5 Q40 15 40.5 17.5 L44 36.5 Q44.5 39 42 39 H6 Q3.5 39 4 36.5 L7.5 17.5 Q8 15 10.5 15 Z"/>`
      + `<path class="face" d="M16.5 22 H31.5 Q31.5 29.5 24 33 Q16.5 29.5 16.5 22 Z"/>` + line("M16.5 25 H19 M29 25 H31.5"),
    sacs: `<path d="M19 17 L14.5 7 Q20 7.5 24 12 Q28 7.5 33.5 7 L29 17 Z"/>`
      + `<path d="M15 17 H33 Q39.5 25 38.5 35 Q37.5 44 24 44 Q10.5 44 9.5 35 Q8.5 25 15 17 Z"/>` + line("M17.5 17 H30.5"),
    debarbouillette: `<path d="${drop(24, 11.5, 4.5)}"/><path d="M9 20 H39 Q41 20 41 22 V42 Q41 44 39 44 H9 Q7 44 7 42 V22 Q7 20 9 20 Z"/>`
      + line("M7 26 H41 M7 38 H41"),
    desinfectant: `<path d="M16.5 7 H30 V12.5 H16.5 Z"/>` + line("M16.5 9.75 H10") + `<path d="M20.5 12.5 H27.5 V18 H20.5 Z"/>`
      + `<path d="M17.5 18 H30.5 Q34.5 18 34.5 22 V40.5 Q34.5 44.5 30.5 44.5 H17.5 Q13.5 44.5 13.5 40.5 V22 Q13.5 18 17.5 18 Z"/>`
      + line("M24 25.5 V37.5 M18 31.5 H30"),
    // Vêtements et confort
    rechange: `<path d="M17 8 L9 13 L12 19 L15 17 V31 Q15 36 20 40 H28 Q33 36 33 31 V17 L36 19 L39 13 L31 8 Q24 14 17 8 Z"/>` + dots("M24 34 v.01"),
    lange: `<path d="M7 7 H41 V31 L31 41 H7 Z"/><path class="face" d="M41 31 H31 V41 Z"/>`
      + dots("M14 14 v.01 M24 14 v.01 M34 14 v.01 M19 21.5 v.01 M29 21.5 v.01 M14 29 v.01 M24 29 v.01 M19 36 v.01"),
    suce: `<path d="M18 24 Q15 19 10 19 Q4.5 19 4.5 24 Q4.5 29 10 29 Q15 29 18 24 Z"/>`
      + `<path d="M17 13 Q17 8 20.5 8 Q24 8 24 13 V35 Q24 40 20.5 40 Q17 40 17 35 Z"/>`
      + `<path d="M24 21 H28 V27 H24 Z"/>` + line("M35.5 15.5 A8.5 8.5 0 1 1 35.49 15.5"),
    doudou: `<circle cx="12.5" cy="14" r="5.5"/><circle cx="35.5" cy="14" r="5.5"/><circle cx="24" cy="27" r="15"/>`
      + `<ellipse class="face" cx="24" cy="32.5" rx="6.5" ry="5"/>` + dots("M18.5 24 v.01 M29.5 24 v.01 M24 30.5 v.01"),
    livre: `<path d="M24 12 Q16 6.5 5 8.5 V38.5 Q16 36.5 24 41.5 Q32 36.5 43 38.5 V8.5 Q32 6.5 24 12 Z"/>`
      + line("M24 12 V41.5 M10 16 Q15 15 19.5 17.5 M10 22.5 Q15 21.5 19.5 24 M28.5 17.5 Q33 15 38 16 M28.5 24 Q33 21.5 38 22.5"),
    dentition: `<path fill-rule="evenodd" d="M24 9 A16 16 0 1 0 24.01 9 Z M24 17 A8 8 0 1 0 24.01 17 Z"/>`
      + dots("M24 13 v.01 M13.6 31 v.01 M34.4 31 v.01 M12.5 20 v.01 M35.5 20 v.01 M24 39 v.01"),
    chapeau: `<path d="M15 27 Q16 13 24 13 Q32 13 33 27 Z"/><path d="M6 30 Q24 23 42 30 Q24 36 6 30 Z"/>`,
    bonnet: `<path d="M11 31 Q11 15 24 15 Q37 15 37 31 Z"/><path d="M9 31 H39 V37 H9 Z"/><circle cx="24" cy="11" r="4"/>`,
    pull: `<path d="M17 8 L9 13 L5 31 L11 32 L14 19 V40 H34 V19 L37 32 L43 31 L39 13 L31 8 Q24 13 17 8 Z"/>`
      + line("M14 36 H34 M5.6 28 L11.6 29 M42.4 28 L36.4 29"),
    couverture: `<path d="M8 10 H40 V38 H8 Z"/>` + line("M8 19 H40 M8 29 H40 M19 10 V38 M29 10 V38"),
    chaussettes: `<path d="M17 6 H27 V25 L35 31 Q39 35 36 39 Q33 42 28 39 L17 32 Z"/>` + line("M17 11 H27"),
    ventilateur: `<path d="M21 30 H27 V43 Q27 44.5 25.5 44.5 H22.5 Q21 44.5 21 43 Z"/><circle cx="24" cy="18" r="14"/>`
      + [0, 120, 240].map((a) => `<path class="face" transform="rotate(${a} 24 18)" d="M24 18 Q18.5 11.5 23 6 Q30 9.5 24 18 Z"/>`).join("")
      + `<circle cx="24" cy="18" r="2.5"/>`,
    portebebe: line("M14 5 Q12 13 15 20 M34 5 Q36 13 33 20") + `<circle class="face" cx="24" cy="15" r="6.5"/>`
      + `<path d="M13.5 19 H34.5 Q37 31 30.5 42 H17.5 Q11 31 13.5 19 Z"/>` + line("M8 38 H40"),
    // Santé et papiers
    carnet: `<path d="M9 5 H37 Q39 5 39 7 V41 Q39 43 37 43 H9 Z"/>` + line("M14.5 5 V43")
      + `<path class="face" d="M24.5 15 H29.5 V19.5 H34 V24.5 H29.5 V29 H24.5 V24.5 H20 V19.5 H24.5 Z"/>`,
    carte: `<path d="M6 11 H42 Q45 11 45 14 V35 Q45 38 42 38 H6 Q3 38 3 35 V14 Q3 11 6 11 Z"/>`
      + `<path class="face" d="M8 17 H19 V32 H8 Z"/>` + line("M23.5 19 H40 M23.5 25 H40 M23.5 31 H34"),
    // Parents
    eau: `<path d="M19 3.5 H29 V9 H19 Z"/><path d="M17 9 H31 Q34.5 12 34.5 16.5 V41 Q34.5 44.5 31 44.5 H17 Q13.5 44.5 13.5 41 V16.5 Q13.5 12 17 9 Z"/>`
      + line("M13.5 24 Q18.75 20.5 24 24 Q29.25 27.5 34.5 24 M13.5 31 Q18.75 27.5 24 31 Q29.25 34.5 34.5 31"),
    collation: line("M24 16 Q24 10 27.5 6.5") + `<path d="M25.5 11 Q30 5.5 36 7.5 Q32 13 25.5 11 Z"/>`
      + `<path d="M24 16 Q16 11 11 17 Q6 24 10 34 Q14 44 20 44 Q22 44 24 42 Q26 44 28 44 Q34 44 38 34 Q42 24 37 17 Q32 11 24 16 Z"/>`,
    tshirt: `<path d="M17 7 L5.5 13 L10 22.5 L14 20.5 V42 H34 V20.5 L38 22.5 L42.5 13 L31 7 Q24 12.5 17 7 Z"/>`,
    // Anything else: a bag
    sac: `<path d="M17 15 V11 Q17 5 24 5 Q31 5 31 11 V15" class="no-fill"/><path d="M8 15 H40 L38 43 H10 Z"/>`
  };
  const svg = (key) => `<svg class="pic" viewBox="0 0 48 48" aria-hidden="true">${P[key] || P.sac}</svg>`;
  window.Pictos = { svg, has: (key) => !!P[key], keys: Object.keys(P) };
})();
