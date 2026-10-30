import type { BoothId } from "./festival-rules";

// The same small, solid-color objects appear on the map and in the build menu.
// These are festival attractions, rather than generic feature icons.
export function AttractionArt({ id, className = "" }: { id: BoothId; className?: string }) {
  return <svg className={className} viewBox="0 0 160 120" fill="none" aria-hidden="true">
    {id === "robot" && <>
      <path d="M26 102V71L80 48l54 23v31" fill="#F17860" />
      <path d="m19 69 61-29 61 29-9 9-52-24-52 24Z" fill="#B83F34" />
      <path d="M40 99V76h80v23" fill="#FECFB6" />
      <path d="M67 38V25m26 13V25" stroke="#264641" strokeWidth="5" strokeLinecap="round" />
      <circle cx="67" cy="22" r="5" fill="#F5C64D" /><circle cx="93" cy="22" r="5" fill="#F5C64D" />
      <rect x="53" y="35" width="54" height="42" rx="13" fill="#F7EDD2" />
      <rect x="60" y="43" width="40" height="22" rx="7" fill="#284F46" />
      <circle cx="70" cy="53" r="4" fill="#B7E9BF" /><circle cx="90" cy="53" r="4" fill="#B7E9BF" />
      <path d="M72 71h16" stroke="#B24B3A" strokeWidth="3" strokeLinecap="round" />
      <rect x="58" y="81" width="44" height="25" rx="6" fill="#DAA14D" />
      <circle cx="80" cy="92" r="6" fill="#FFF1CE" />
      <path d="m50 87-8 10m68-10 8 10" stroke="#284F46" strokeWidth="7" strokeLinecap="round" />
      <path d="M56 107h48" stroke="#264641" strokeWidth="5" strokeLinecap="round" />
    </>}
    {id === "mural" && <>
      <path d="m29 108 8-76m94 76-8-76" stroke="#7D4B4C" strokeWidth="7" strokeLinecap="round" />
      <rect x="26" y="27" width="108" height="73" rx="5" fill="#FFF0D5" />
      <path d="M30 82c19-35 27 22 50-8s32-32 50-12v34H30Z" fill="#5F9B79" />
      <path d="M30 82c16-13 32-11 45 14H30Z" fill="#BBD9A1" />
      <circle cx="58" cy="49" r="12" fill="#EBA047" />
      <path d="m90 35 12 21 22-4" stroke="#DE7793" strokeWidth="9" strokeLinecap="round" />
      <path d="m94 81 13-9 12 9" stroke="#F5C64D" strokeWidth="6" strokeLinecap="round" />
      <path d="M24 102h113" stroke="#7D4B4C" strokeWidth="6" strokeLinecap="round" />
      <rect x="15" y="88" width="16" height="20" rx="3" fill="#DD6483" />
      <path d="m21 87 8-23" stroke="#7D4B4C" strokeWidth="4" strokeLinecap="round" />
    </>}
    {id === "food" && <>
      <rect x="35" y="52" width="94" height="49" rx="6" fill="#F2BA4D" />
      <path d="M27 52 43 26h78l16 26Z" fill="#DB7352" />
      <path d="m49 26-8 26h19l4-26m23 0 4 26h19l-8-26" fill="#FBE6B1" />
      {[27,49,71,93,115].map((x, i) => <path key={x} d={`M${x} 52h22v7a11 11 0 0 1-22 0Z`} fill={i % 2 ? "#FBE6B1" : "#DB7352"} />)}
      <rect x="47" y="70" width="68" height="24" rx="3" fill="#754E36" />
      <path d="M44 95h76" stroke="#FFE3A6" strokeWidth="6" strokeLinecap="round" />
      <path d="M71 73V62m18 11V62" stroke="#FFF1D4" strokeWidth="4" strokeLinecap="round" />
      <circle cx="71" cy="59" r="6" fill="#DA7792" /><circle cx="89" cy="59" r="6" fill="#C0CD84" />
      <circle cx="50" cy="105" r="8" fill="#355249" /><circle cx="115" cy="105" r="8" fill="#355249" />
      <path d="M71 19c-8-10 8-9 0-17m17 17c-8-10 8-9 0-17" stroke="#D7AB75" strokeWidth="3" strokeLinecap="round" />
    </>}
    {id === "arcade" && <>
      <path d="M29 103V54L80 16l51 38v49Z" fill="#7F9FB9" />
      <path d="m20 57 60-45 60 45Z" fill="#385B7B" />
      <path d="m65 23 15-11 15 11 20 34H45Z" fill="#D5DECF" />
      <path d="M58 103V70a22 22 0 0 1 44 0v33" fill="#2E4349" />
      <rect x="65" y="65" width="30" height="38" rx="3" fill="#E19B5E" />
      <rect x="69" y="69" width="22" height="19" rx="2" fill="#293F42" />
      <path d="M75 79h10m-5-5v10" stroke="#C9DF9A" strokeWidth="3" strokeLinecap="round" />
      <path d="m70 96 3-4m14 4h2" stroke="#FBEDC9" strokeWidth="3" strokeLinecap="round" />
      <path d="M79 12V1l23 5-23 5" fill="#DA805A" />
      <circle cx="39" cy="69" r="4" fill="#FAE49D" /><circle cx="121" cy="69" r="4" fill="#FAE49D" />
    </>}
    {id === "music" && <>
      <path d="M30 101V45m100 56V45" stroke="#9C5F3E" strokeWidth="7" strokeLinecap="round" />
      <path d="M20 45 80 17l60 28Z" fill="#D6854D" />
      <path d="M37 46h86v54H37Z" fill="#F8CE92" />
      <path d="M37 46h18v52H37m68-52h18v52h-18" fill="#CD7053" />
      <rect x="25" y="99" width="110" height="10" rx="4" fill="#9C5F3E" />
      <rect x="44" y="78" width="15" height="21" rx="3" fill="#3A5146" /><circle cx="51.5" cy="91" r="4" fill="#7B9C76" />
      <rect x="102" y="78" width="15" height="21" rx="3" fill="#3A5146" /><circle cx="109.5" cy="91" r="4" fill="#7B9C76" />
      <path d="M79 95V67m-7 28h14m-6-28 7-6" stroke="#3A5146" strokeWidth="3" strokeLinecap="round" />
      <path d="M92 51V38l11-3v12" stroke="#7D4A39" strokeWidth="3" strokeLinecap="round" /><ellipse cx="89" cy="52" rx="4" ry="3" fill="#7D4A39" /><ellipse cx="100" cy="48" rx="4" ry="3" fill="#7D4A39" />
    </>}
    {id === "garden" && <>
      <path d="M31 68 80 24l49 44v37H31Z" fill="#C6D9A2" />
      <path d="m23 69 57-51 57 51" stroke="#567958" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M80 25v78M34 68h92m-70-22v57m48-57v57" stroke="#79A17B" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 100h121l-7 12H27Z" fill="#B47B52" />
      <path d="M40 99V83m25 16V77m28 22V85m25 14V78" stroke="#4E7854" strokeWidth="4" strokeLinecap="round" />
      {[40,65,93,118].map((x, i) => <g key={x}><ellipse cx={x-5} cy={i%2?87:91} rx="7" ry="4" transform={`rotate(30 ${x-5} 91)`} fill="#57885E" /><circle cx={x} cy={i%2?75:81} r="7" fill={i%2?"#E7B24F":"#D98D94"} /><circle cx={x} cy={i%2?75:81} r="2.5" fill="#FFF0C8" /></g>)}
    </>}
  </svg>;
}

function Tree({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${small ? .65 : 1})`}>
    <ellipse cy="8" rx="21" ry="7" fill="#84AE6C" />
    <path d="M0 4v-33" stroke="#7A7250" strokeWidth="7" strokeLinecap="round" />
    <path d="M0-72c-22 0-31 22-25 35-15 20 4 37 25 28 23 9 39-12 25-28C33-51 21-72 0-72Z" fill="#52845A" />
    <path d="M-7-62c-11 2-17 15-13 24" stroke="#76A16C" strokeWidth="7" strokeLinecap="round" />
  </g>;
}

export function FestivalMap({ selected, open }: { selected: readonly BoothId[]; open: boolean }) {
  const plots = [{ x: 145, y: 210 }, { x: 380, y: 195 }, { x: 135, y: 355 }, { x: 380, y: 348 }];
  return <svg className="festival-map" viewBox="0 0 720 490" fill="none" role="img" aria-label={`Your festival grounds with ${selected.length} of 4 attractions built${open ? ", gates open and visitors arriving" : ""}`}>
    <defs>
      <pattern id="festival-grass" width="37" height="33" patternUnits="userSpaceOnUse"><path d="m9 20 2-4 2 4m17-12 1-3" stroke="#7DAC72" strokeWidth="1.5" strokeLinecap="round" opacity=".4" /></pattern>
    </defs>
    <path d="M0 0h720v490H0Z" fill="#C8E2DB" />
    <g className="festival-clouds" fill="#F3F6DF"><path d="M75 54c-4-15 21-24 30-12 11-22 42-13 40 5 21-4 25 16 10 19H81c-14-1-17-10-6-12Z" /><path d="M491 42c-4-15 21-24 30-12 11-22 42-13 40 5 21-4 25 16 10 19h-74c-14-1-17-10-6-12Z" /></g>
    <circle cx="635" cy="57" r="27" fill="#F2CE72" />
    <path d="M0 135Q135 50 290 120T580 115T770 90V490H0Z" fill="#9EBB85" />
    <path d="M0 185Q150 115 320 163T720 142V490H0Z" fill="#B4CE94" />
    <path d="M0 185Q150 115 320 163T720 142V490H0Z" fill="url(#festival-grass)" />
    <path d="M308 490V177m0 105H111m197 0h230m-230 0v114H119m189 0h230" stroke="#E8D7AE" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M309 490V178" stroke="#F3E5C7" strokeWidth="20" strokeLinecap="round" />
    <path d="M0 104Q360 186 720 104" fill="none" stroke="#657E5A" strokeWidth="2" />
    {Array.from({ length: 18 }, (_, i) => {
      const x = 18 + i * 40, y = 106 + 40 * Math.sin((x / 720) * Math.PI);
      return <path className="festival-pennant" key={i} d={`m${x} ${y} 18 4-11 20Z`} fill={["#CF7861", "#E8C16A", "#699BA4", "#D68D9C"][i % 4]} style={{ animationDelay: `${i * -.13}s` }} />;
    })}
    <Tree x={55} y={213} /><Tree x={653} y={201} /><Tree x={581} y={150} small /><Tree x={82} y={128} small />
    <ellipse cx="600" cy="330" rx="72" ry="50" fill="#98B57E" />
    <path d="M550 325c-26-32 38-48 53-27 22-21 77 4 54 30 12 32-46 53-68 30-16 11-50-13-39-33Z" fill="#6CA4A0" />
    <path d="M576 320c10-6 18-6 27-1m22 17h12m-67 2h14" stroke="#B7D6BA" strokeWidth="3" strokeLinecap="round" />
    <path d="m633 300 6 7-12 1Z" fill="#F6E4B3" /><circle cx="638" cy="301" r="3" fill="#F6E4B3" />
    <Tree x={652} y={430} /><Tree x={65} y={443} /><Tree x={567} y={440} small /><Tree x={23} y={339} small />
    {plots.map((plot, i) => <g key={i} transform={`translate(${plot.x} ${plot.y})`}>
      <ellipse cy="27" rx="85" ry="29" fill={selected[i] ? "#9CB77B" : "#A1BF83"} />
      {selected[i] ? <g key={selected[i]} className="festival-built"><svg x="-86" y="-91" width="172" height="129" viewBox="0 0 160 120"><AttractionArt id={selected[i]} /></svg></g> : <>
        <path d="m-59 13 59-23 59 23-59 23Z" fill="#C3D49C" />
        <path d="M-9 11H9M0 2v18" stroke="#6F8F5B" strokeWidth="4" strokeLinecap="round" />
        <text y="52" textAnchor="middle" fill="#496443" fontSize="12" fontFamily="system-ui" fontWeight="600">Plot {i + 1}</text>
      </>}
    </g>)}
    <g transform="translate(273 423)">
      <path d="M0 45V-5m72 50V-5" stroke="#A0644C" strokeWidth="9" strokeLinecap="round" />
      <path d="M-9-12Q36-30 81-12V7Q36-5-9 7Z" fill="#F1D28A" />
      <text x="36" y="-5" dominantBaseline="central" textAnchor="middle" fill="#5B5940" fontSize="13" fontWeight="800" fontFamily="system-ui">FESTIVAL</text>
      <g className={open ? "festival-gate is-open" : "festival-gate"}><path d="M1 18h34v26H1Z" fill="#B77C56" /><path d="M38 18h33v26H38Z" fill="#B77C56" /><path d="M8 22v17m10-17v17m10-17v17m17-17v17m10-17v17m10-17v17" stroke="#DDB583" strokeWidth="3" strokeLinecap="round" /></g>
    </g>
    {open && Array.from({ length: 14 }, (_, i) => <g key={i} className="festival-walker" style={{ animationDelay: `${i * -.6}s`, transformOrigin: `${288 + (i % 3) * 21}px ${220 + (i * 31) % 230}px` }} transform={`translate(${288 + (i % 3) * 21} ${220 + (i * 31) % 230})`}>
      <ellipse cy="10" rx="6" ry="3" fill="#AEB98A" /><path d="M-3 8V0h6v8" stroke={["#BB6D57", "#4D7F83", "#D1A243", "#7C7190"][i % 4]} strokeWidth="6" strokeLinecap="round" /><circle cy="-8" r="5" fill={["#A06F50", "#E9BC87", "#C9966B"][i % 3]} />
    </g>)}
  </svg>;
}

export function VisitorArt({ index }: { index: number }) {
  return <svg viewBox="0 0 60 80" aria-hidden="true"><path d="M22 73V55m17 18V55" stroke="#365F50" strokeWidth="9" strokeLinecap="round" /><path d="M17 57V34q13-12 26 0v23Z" fill={["#ECA76C", "#B47B99", "#6EADB2", "#D9BD5A", "#A4BE77"][index % 5]} /><path d="m17 36-9 9m35-9 8-15" stroke="#B88460" strokeWidth="7" strokeLinecap="round" /><circle cx="30" cy="20" r="12" fill="#D6A77F" /><path d="M18 17c-2-20 27-19 26 1l-10-4-16 3Z" fill="#4E5440" /><path d="M26 23q4 4 8 0" stroke="#6F4A3E" strokeWidth="2" strokeLinecap="round" /><circle cx="25" cy="19" r="1.4" fill="#534637" /><circle cx="35" cy="19" r="1.4" fill="#534637" /></svg>;
}
