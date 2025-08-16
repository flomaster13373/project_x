import * as THREE from 'three';
import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Loader, useGLTF } from '@react-three/drei';
import { Suspense } from 'react';

/* ===== настройки ===== */
const SETTINGS = {
  background: '#8d8d8dff',   // цвет фона сцены
  dpr: [1,2],                 // плотность рендера (ретина — 2)
  camera: {
    position: [25, 15, 25],   // стартовая позиция камеры
    fov: 45,                  // угол обзора
    near: 0.5,                // ближняя граница прорисовки
    far: 100,                 // дальняя граница прорисовки
  },
  controls: {
    target: [0, 0, 0],        // куда смотрит камера
    damping: 0.3,             // «инерция» вращения
    minDistance: 20,          // минимальное приближение
    maxDistance: 60,          // максимальное отдаление
    autoRotate: true,         // автоповорот камеры
    autoRotateSpeed: 2,
  },
  lights: {
    ambient: 0,               // яркость мягкого света
    dirIntensity: 0,          // яркость направленного света
    dirPosition: [1, 1, 1],   // позиция направленного света
  },
  env: {
    preset: 'studio',         // 'studio' | 'city' | 'sunset' и т.д.
    useAsBackground: false,   // true — HDRI станет фоном
  },
  helpers: {
    grid: false,              // показать сетку
    axes: false,              // показать оси
  },
};
/* =========================================== */

/* ===== Параметры анимации по Y ===== */
const ANIM = {
  durationSec: 1.5,  // длительность одной фазы
  staggerMs: 120,    // задержка между моделями
  yStep: 3.5,          // шаг между соседними моделями по Y
};

/* ease-in-out cubic */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Один экземпляр модели с анимацией по оси Y */
function ModelInstance({ url, index, centerIndex, isExploded, t0 }) {
  const outer = useRef();          // внешний слой: двигаем только его по Y
  const fromYRef = useRef(0);      // старт Y при каждом переключении
  const { scene } = useGLTF(url, true, true);

  // Тени (трансформы из Blender не трогаем)
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Цель по Y: симметрично вокруг нуля
  const targetY = useMemo(() => (index - centerIndex) * ANIM.yStep, [index, centerIndex]);

  // Запоминаем текущий Y как точку старта новой фазы
  useEffect(() => {
    if (!outer.current) return;
    fromYRef.current = outer.current.position.y || 0;
  }, [isExploded, t0]);

  // Анимация: fromY -> (isExploded ? targetY : 0)
  useFrame(() => {
    if (!outer.current || t0 === null) return;
    const now = performance.now();
    const localStart = t0 + index * ANIM.staggerMs;
    const dt = now - localStart;
    if (dt < 0) return;

    const t = Math.min(1, dt / (ANIM.durationSec * 1000));
    const k = easeInOutCubic(t);
    const toY = isExploded ? targetY : 0;
    const fromY = fromYRef.current;
    outer.current.position.y = fromY + (toY - fromY) * k;
  });

  const UNIT_SCALE = 0.01; // м → см 

  return (
    <group ref={outer /* анимируем этот слой по Y */}>
      <group scale={UNIT_SCALE /* внутренний слой: масштаб единиц */}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// Предзагрузка
for (let i = 1; i <= 9; i++) useGLTF.preload(`/models/${i}.glb`);

export default function App() {
  const sources = useMemo(() => Array.from({ length: 9 }, (_, i) => `/models/${i + 1}.glb`), []);
  const centerIndex = useMemo(() => Math.floor((sources.length - 1) / 2), [sources.length]);

  const [isExploded, setIsExploded] = useState(false);
  const [t0, setT0] = useState(null); // момент старта текущей фазы

  const toggleArrange = () => {
    setIsExploded(v => !v);
    setT0(performance.now());
  };

  return (
    <div style={{ width:'100vw', height:'100vh', position:'relative', background: SETTINGS.background }}>
      {/* Сайд-кнопка */}
      <button
        onClick={toggleArrange}
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          padding: '10px 14px',
          borderRadius: 12,
          border: 'none',
          background: '#00000080',
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
        }}
      >
        {isExploded ? 'Reset' : 'Arrange'}
      </button>

      <Canvas
        style={{ position:'absolute', inset:0 }}
        dpr={SETTINGS.dpr}
        camera={{
          position: SETTINGS.camera.position,
          fov: SETTINGS.camera.fov,
          near: SETTINGS.camera.near,
          far: SETTINGS.camera.far,
        }}
        shadows
        onCreated={({ scene }) => {
          // Цвет фона WebGL (если HDRI не используется как фон)
          if (!SETTINGS.env.useAsBackground) {
            scene.background = new THREE.Color(SETTINGS.background);
          }
        }}
      >
        {/* Свет */}
        <ambientLight intensity={SETTINGS.lights.ambient} />
        <directionalLight
          position={SETTINGS.lights.dirPosition}
          intensity={SETTINGS.lights.dirIntensity}
          castShadow
        />

        <Suspense fallback={null}>
          {/* Окружение (HDRI) */}
          <Environment preset={SETTINGS.env.preset} background={SETTINGS.env.useAsBackground} />

          {/* Рендерим модели «как есть», двигаем только внешний слой по Y */}
          {sources.map((src, i) => (
            <ModelInstance
              key={src}
              url={src}
              index={i}
              centerIndex={centerIndex}
              isExploded={isExploded}
              t0={t0}
            />
          ))}
        </Suspense>

        {/* Управление камерой */}
        <OrbitControls
          makeDefault
          target={SETTINGS.controls.target}
          enableDamping
          dampingFactor={SETTINGS.controls.damping}
          minDistance={SETTINGS.controls.minDistance}
          maxDistance={SETTINGS.controls.maxDistance}
          autoRotate={SETTINGS.controls.autoRotate}
          autoRotateSpeed={SETTINGS.controls.autoRotateSpeed}
        />

        {/* Хелперы по желанию */}
        {SETTINGS.helpers.grid && <gridHelper args={[100, 50]} />}
        {SETTINGS.helpers.axes && <axesHelper args={[5]} />}
      </Canvas>

      <Loader />
    </div>
  );
}