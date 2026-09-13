"use client";
import { Agent, Mission } from "@/lib/domain";
export function Avatar({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 40"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <ellipse cx="16" cy="37" rx="12" ry="3" fill="#273527" opacity=".17" />
      <path d="M9 30h6v8H8v-3zm9 0h6v8h-7v-3" fill="#3c4850" />
      <path d="M6 21h20v11H6zM3 23h4v8H3zm23 0h4v8h-4" fill={color} />
      <path d="M9 6h15v16H9zM6 10h3v9H6z" fill="#eac4a5" />
      <path d="M8 5h17v6H12v4H7zM21 10h5v7h-3z" fill="#4b3b38" />
      <path d="M13 15h2v3h-2zm7 0h2v3h-2z" fill="#3e3535" />
      <path d="M16 20h4v1h-4z" fill="#ac796d" />
    </svg>
  );
}
function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="18" rx="17" ry="7" fill="#304c36" opacity=".14" />
      <path d="M-10 0h20l-3 20H-7z" fill="#d6b69b" />
      <path
        d="M0 6C-32 0-18-28-4-11C-9-39 13-33 8-10C30-27 29 5 5 7"
        fill="#567e4b"
      />
      <path
        d="M0 7V-18M0 5l-13-15M0 3l15-11"
        stroke="#87a473"
        strokeWidth="2"
      />
    </g>
  );
}
function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-48" y="-21" width="96" height="49" rx="5" fill="#ac8565" />
      <rect
        x="-48"
        y="-27"
        width="96"
        height="48"
        rx="5"
        fill="#e8c5a1"
        stroke="#c1a27e"
      />
      <rect x="-25" y="-37" width="43" height="28" rx="3" fill="#455857" />
      <rect x="-21" y="-34" width="35" height="20" rx="1" fill="#aec5b9" />
      <path d="M-16-29h13m-13 5H7m-23 5h7" stroke="#718e80" strokeWidth="2" />
      <rect x="-13" y="-5" width="31" height="10" rx="2" fill="#f5e7cf" />
      <circle cx="32" cy="-5" r="5" fill="#fbf2df" />
      <rect
        x="-16"
        y="34"
        width="34"
        height="27"
        rx="9"
        fill="#6f8181"
        stroke="#536663"
        strokeWidth="3"
      />
    </g>
  );
}
const seats = [
  [180, 210],
  [210, 410],
  [410, 210],
  [410, 410],
  [706, 220],
  [791, 385],
];
const meeting = [[610,137],[704,123],[802,137],[614,240],[706,240],[799,240]];
export default function Office({
  agents,
  mission,
  onAgent,
  zoom = 1,
}: {
  agents: Agent[];
  mission?: Mission;
  onAgent: (a: Agent) => void;
  zoom?: number;
}) {
  let working = mission?.status === "running";
  let gathering =
    working && !!mission && (mission.step === 0 || mission.step >= 4);
  return (
    <div className="office-viewport">
      <div className="office-world" style={{ transform: `scale(${zoom})` }}>
        <svg
          className="office-map"
          viewBox="0 0 980 610"
          role="img"
          aria-label="Engineering office with build studio, meeting room, and lounge"
        >
          <defs>
            <pattern
              id="grass"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <rect width="24" height="24" fill="#cad8b4" />
              <path d="M3 8h3m10 11h2" stroke="#b6c69f" strokeWidth="2" />
            </pattern>
            <pattern
              id="floor"
              width="90"
              height="34"
              patternUnits="userSpaceOnUse"
            >
              <rect width="90" height="34" fill="#ebdfc8" />
              <path d="M0 33h90M45 0v33" stroke="#dfd1b8" strokeWidth="1" />
            </pattern>
            <pattern
              id="rug"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <rect width="8" height="8" fill="#c2cbb3" />
              <path d="M0 4h8M4 0v8" stroke="#b9c3aa" strokeWidth=".7" />
            </pattern>
          </defs>
          <rect width="980" height="610" fill="url(#grass)" />
          <path d="M445 610V529h95v81" fill="#e2dfcd" />
          <path
            d="M466 550h53m-53 26h53m-53 26h53"
            stroke="#cbcbb9"
            strokeWidth="2"
          />
          <rect
            x="76"
            y="68"
            width="828"
            height="472"
            rx="5"
            fill="#9eaa8c"
            opacity=".5"
          />
          <rect x="66" y="48" width="838" height="477" rx="5" fill="#879180" />
          <rect x="76" y="58" width="818" height="451" fill="url(#floor)" />
          <path d="M76 78H894" stroke="#d0cfb5" strokeWidth="26" />
          <path d="M76 48H904v13H76z" fill="#f6f0dd" />
          <path d="M76 61H894v16H76" fill="#d8d5bc" />
          <path d="M77 78v431M894 77v432" stroke="#f5efdb" strokeWidth="12" />
          <rect
            x="131"
            y="56"
            width="118"
            height="17"
            fill="#aac7c3"
            stroke="#8da7a2"
            strokeWidth="3"
          />
          <path d="M190 57v15" stroke="#f8f5e5" strokeWidth="4" />
          <rect
            x="334"
            y="56"
            width="119"
            height="17"
            fill="#aac7c3"
            stroke="#8da7a2"
            strokeWidth="3"
          />
          <path d="M393 57v15" stroke="#f8f5e5" strokeWidth="4" />
          <rect
            x="582"
            y="57"
            width="244"
            height="15"
            fill="#acc7c3"
            stroke="#8da7a2"
            strokeWidth="3"
          />
          <path
            d="M642 57v15m60-15v15m60-15v15"
            stroke="#f8f5e5"
            strokeWidth="4"
          />
          <rect
            x="112"
            y="115"
            width="384"
            height="349"
            rx="8"
            fill="url(#rug)"
          />
          <Desk x={185} y={174} />
          <Desk x={397} y={174} />
          <Desk x={185} y={374} />
          <Desk x={397} y={374} />
          <path d="M530 80v171m0 99v157" stroke="#adad94" strokeWidth="10" />
          <path d="M528 80v171m0 99v157" stroke="#f6efdc" strokeWidth="9" />
          <rect
            x="568"
            y="123"
            width="272"
            height="123"
            rx="8"
            fill="#d7dcca"
          />
          <rect
            x="615"
            y="146"
            width="179"
            height="68"
            rx="30"
            fill="#ac8465"
          />
          <rect
            x="615"
            y="139"
            width="179"
            height="68"
            rx="30"
            fill="#e1ba91"
            stroke="#c19c77"
            strokeWidth="2"
          />
          {[642, 700, 758].map((x) => (
            <g key={x}>
              <rect
                x={x}
                y="116"
                width="28"
                height="20"
                rx="6"
                fill="#758d7c"
              />
              <rect
                x={x}
                y="215"
                width="28"
                height="20"
                rx="6"
                fill="#758d7c"
              />
            </g>
          ))}
          <rect x="682" y="152" width="33" height="23" rx="2" fill="#f7f0db" />
          <path d="M688 158h20m-20 6h15" stroke="#bcc2af" strokeWidth="2" />
          <circle cx="745" cy="171" r="6" fill="#f8f1db" />
          <path d="M536 277h83m92 0h179" stroke="#f6efdc" strokeWidth="9" />
          <rect
            x="576"
            y="311"
            width="245"
            height="152"
            rx="45"
            fill="#d9b89e"
            opacity=".45"
          />
          <rect
            x="575"
            y="333"
            width="54"
            height="106"
            rx="12"
            fill="#658a71"
          />
          <rect x="583" y="338" width="36" height="92" rx="8" fill="#83a084" />
          <path d="M584 383h33" stroke="#688b70" strokeWidth="3" />
          <rect
            x="773"
            y="331"
            width="49"
            height="108"
            rx="12"
            fill="#658a71"
          />
          <rect x="783" y="337" width="31" height="93" rx="8" fill="#83a084" />
          <path d="M784 383h30" stroke="#688b70" strokeWidth="3" />
          <ellipse cx="701" cy="384" rx="43" ry="32" fill="#b89373" />
          <ellipse cx="701" cy="378" rx="43" ry="31" fill="#edcaa5" />
          <rect
            x="681"
            y="367"
            width="22"
            height="17"
            transform="rotate(-12 681 367)"
            fill="#ecebdb"
          />
          <circle cx="719" cy="381" r="6" fill="#f8f0dc" />
          <Plant x={111} y={94} />
          <Plant x={494} y={88} />
          <Plant x={858} y={108} />
          <Plant x={857} y={470} />
          <Plant x={110} y={476} />
          <rect x="275" y="90" width="53" height="23" rx="3" fill="#b19072" />
          <rect x="281" y="92" width="9" height="17" fill="#789a83" />
          <rect x="293" y="94" width="7" height="15" fill="#bc9273" />
          <rect x="303" y="91" width="8" height="18" fill="#e6c27f" />
          <rect x="314" y="93" width="8" height="16" fill="#9aa8b3" />
          <path d="M77 509h365m101 0h351" stroke="#f8f0de" strokeWidth="13" />
          <text
            x="304"
            y="284"
            textAnchor="middle"
            fill="#7b8870"
            fontSize="13"
            fontFamily="sans-serif"
            letterSpacing="2"
          >
            BUILD STUDIO
          </text>
          <text
            x="705"
            y="102"
            textAnchor="middle"
            fill="#8c907b"
            fontSize="12"
            fontFamily="sans-serif"
            letterSpacing="2"
          >
            THE ROUND TABLE
          </text>
          <text
            x="702"
            y="484"
            textAnchor="middle"
            fill="#9e8a72"
            fontSize="12"
            fontFamily="sans-serif"
            letterSpacing="2"
          >
            IDEA LOUNGE
          </text>
          <Plant x={32} y={340} />
          <Plant x={946} y={221} />
          <Plant x={909} y={568} />
          <Plant x={55} y={572} />
        </svg>
        {agents.map((a, i) => {
          const active =
            working && mission?.tasks[mission.step]?.role === a.role;
          const pos = gathering ? meeting[i % 6] : seats[i % 6];
          return (
            <button
              key={a.id}
              className={`map-agent ${active ? "is-working" : ""}`}
              style={{ left: `${pos[0] / 9.8}%`, top: `${pos[1] / 6.1}%` }}
              onClick={() => onAgent(a)}
              aria-label={`Inspect ${a.name}, ${a.title}`}
            >
              {active && (
                <span className="speech">
                  {a.role === "frontend"
                    ? "Building the app…"
                    : a.role === "qa"
                      ? "Checking the details…"
                      : "On it…"}
                </span>
              )}
              <Avatar color={a.color} size={44} />
              <span className="agent-nametag">
                <i style={{ background: active ? "#69a976" : "#b9c2b1" }} />
                {a.name}
              </span>
            </button>
          );
        })}
      </div>
      <div className="map-caption">
        <span className="live-dot" />{" "}
        {working
          ? "Office follows the team’s work"
          : "The team is ready when you are"}
        <span>Click a teammate to say hello</span>
      </div>
    </div>
  );
}
