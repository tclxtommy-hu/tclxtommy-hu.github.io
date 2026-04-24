import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const INFO_CONTENT = {
  about: {
    title: 'About Me',
    text: '你好，我是 TommyHu，关注 AI 工程化、开发效率工具和知识分享。这个房间是我的交互式个人主页。',
  },
  skills: {
    title: 'Skills',
    text: 'JavaScript / Node.js / Python / Prompt Engineering / Agent Workflow / DevOps。擅长把复杂流程做成可复用工具。',
  },
  projects: {
    title: 'Projects',
    text: '近期项目聚焦 AI 应用落地、MCP 工具链和技术博客体系。可在博客归档查看完整实践记录与代码片段。',
  },
  contact: {
    title: 'Contact',
    text: '邮箱: 258546962@qq.com · GitHub: tclxtommy-hu。欢迎交流 AI 产品化、工程实践和效率系统。',
  },
};

function makeMaterial(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.05,
    emissive,
    emissiveIntensity: 0.2,
  });
}

function createSuzhouGateModel() {
  const group = new THREE.Group();

  const outer = new THREE.Shape();
  outer.moveTo(-0.55, -0.5);
  outer.lineTo(-0.55, 0.55);
  outer.quadraticCurveTo(-0.28, 0.67, 0, 0.67);
  outer.quadraticCurveTo(0.28, 0.67, 0.55, 0.55);
  outer.lineTo(0.55, -0.5);
  outer.lineTo(-0.55, -0.5);

  const innerHole = new THREE.Path();
  innerHole.moveTo(-0.16, -0.5);
  innerHole.lineTo(-0.16, -0.08);
  innerHole.quadraticCurveTo(0, 0.2, 0.16, -0.08);
  innerHole.lineTo(0.16, -0.5);
  innerHole.lineTo(-0.16, -0.5);
  outer.holes.push(innerHole);

  const gateBody = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outer, {
      depth: 0.16,
      bevelEnabled: false,
      curveSegments: 20,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x9eacc7,
      roughness: 0.3,
      metalness: 0.72,
      emissive: 0x0f1a2e,
      emissiveIntensity: 0.18,
    })
  );
  gateBody.position.set(0, 0, -0.08);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.08, 0.32),
    makeMaterial(0x2f344f)
  );
  plinth.position.set(0, -0.54, 0);

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x1b2236,
    roughness: 0.45,
    metalness: 0.5,
  });

  for (let i = 0; i < 12; i++) {
    const y = -0.42 + i * 0.09;
    const leftAccent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.175), accentMat);
    leftAccent.position.set(-0.45, y, 0);
    const rightAccent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.175), accentMat);
    rightAccent.position.set(0.45, y, 0);
    group.add(leftAccent, rightAccent);
  }

  group.add(gateBody, plinth);
  return group;
}

function createMagnifierModel() {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb2bfd8, roughness: 0.26, metalness: 0.78 });

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.014, 18, 36),
    metalMat
  );
  rim.rotation.x = Math.PI / 2;

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.092, 0.092, 0.01, 24),
    new THREE.MeshStandardMaterial({
      color: 0xa8dcff,
      transparent: true,
      opacity: 0.48,
      roughness: 0.06,
      metalness: 0.1,
      emissive: 0x123a60,
      emissiveIntensity: 0.24,
    })
  );
  lens.position.y = -0.002;

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.28, 10),
    makeMaterial(0x5d3f30)
  );
  handle.position.set(0.18, -0.01, 0.13);
  handle.rotation.z = Math.PI / 2;
  handle.rotation.y = -0.65;

  const connector = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 10),
    metalMat
  );
  connector.position.set(0.1, -0.002, 0.072);

  const tailCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 10, 10),
    makeMaterial(0x8f6e4f)
  );
  tailCap.position.set(0.28, -0.01, 0.205);

  // Larger transparent hit area so clicking is easy.
  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.01 })
  );
  hitArea.position.set(0.08, -0.005, 0.06);

  group.add(rim, lens, handle, connector, tailCap, hitArea);
  return { group, clickable: hitArea };
}

function createDeskCatModel() {
  const group = new THREE.Group();
  const blackMat = makeMaterial(0x1b1d27);
  const whiteMat = makeMaterial(0xe7ecf8);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.38), blackMat);
  body.position.set(0, 0.12, 0);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.13), whiteMat);
  chest.position.set(0, 0.11, 0.16);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), whiteMat);
  head.position.set(0.02, 0.23, 0.19);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.08, 0.2), blackMat);
  cap.position.set(0.02, 0.31, 0.19);

  const earLeft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), blackMat);
  earLeft.position.set(-0.05, 0.36, 0.2);
  earLeft.rotation.y = Math.PI / 4;

  const earRight = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), blackMat);
  earRight.position.set(0.1, 0.36, 0.2);
  earRight.rotation.y = -Math.PI / 4;

  const whiskerMat = new THREE.MeshStandardMaterial({ color: 0xf1f4ff, roughness: 0.22, metalness: 0.08 });
  const whiskerL1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.004), whiskerMat);
  whiskerL1.position.set(-0.055, 0.235, 0.295);
  whiskerL1.rotation.y = 0.36;
  const whiskerL2 = whiskerL1.clone();
  whiskerL2.position.y = 0.22;
  whiskerL2.rotation.y = 0.3;
  const whiskerL3 = whiskerL1.clone();
  whiskerL3.position.y = 0.205;
  whiskerL3.rotation.y = 0.24;

  const whiskerR1 = whiskerL1.clone();
  whiskerR1.position.x = 0.09;
  whiskerR1.rotation.y = -0.36;
  const whiskerR2 = whiskerL2.clone();
  whiskerR2.position.x = 0.09;
  whiskerR2.rotation.y = -0.3;
  const whiskerR3 = whiskerL3.clone();
  whiskerR3.position.x = 0.09;
  whiskerR3.rotation.y = -0.24;

  const pawFL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), whiteMat);
  pawFL.position.set(-0.07, 0.05, 0.12);
  const pawFR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), whiteMat);
  pawFR.position.set(0.03, 0.05, 0.12);
  const pawBL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), blackMat);
  pawBL.position.set(-0.08, 0.05, -0.12);
  const pawBR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), blackMat);
  pawBR.position.set(0.05, 0.05, -0.12);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.24, 8), blackMat);
  tail.position.set(-0.14, 0.21, -0.15);
  tail.rotation.z = -0.85;
  tail.rotation.x = 0.35;

  group.add(
    body,
    chest,
    head,
    cap,
    earLeft,
    earRight,
    whiskerL1,
    whiskerL2,
    whiskerL3,
    whiskerR1,
    whiskerR2,
    whiskerR3,
    pawFL,
    pawFR,
    pawBL,
    pawBR,
    tail
  );
  return group;
}

function addTable(parent) {
  const group = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.12, 1.2),
    makeMaterial(0x5e3d2c)
  );
  top.position.y = 1.03;
  group.add(top);

  const legGeo = new THREE.BoxGeometry(0.1, 1.0, 0.1);
  const legMat = makeMaterial(0x3f2a20);
  const legs = [
    [-1.1, 0.5, -0.5],
    [1.1, 0.5, -0.5],
    [-1.1, 0.5, 0.5],
    [1.1, 0.5, 0.5],
  ];

  for (const [x, y, z] of legs) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, z);
    group.add(leg);
  }

  const laptopBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.04, 0.45),
    makeMaterial(0xb9bccd)
  );
  laptopBase.position.set(0.1, 1.12, 0);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.38, 0.03),
    makeMaterial(0x222838, 0x4fa9ff)
  );
  screen.position.set(0.1, 1.3, -0.2);
  screen.rotation.x = -0.3;

  const suzhouGate = createSuzhouGateModel();
  suzhouGate.scale.set(0.24, 0.24, 0.24);
  suzhouGate.position.set(0.72, 1.2, -0.02);
  suzhouGate.rotation.y = -0.35;

  const magnifierModel = createMagnifierModel();
  magnifierModel.group.scale.set(1.4, 1.4, 1.4);
  magnifierModel.group.position.set(-0.44, 1.12, 0.16);
  magnifierModel.group.rotation.y = 0.42;
  magnifierModel.clickable.userData.action = 'open-search';
  magnifierModel.clickable.userData.interactiveName = 'magnifier';

  const deskCat = createDeskCatModel();
  deskCat.position.set(-0.35, 0, 0.28);
  deskCat.rotation.y = 0.32;

  group.add(laptopBase, screen, suzhouGate, magnifierModel.group, deskCat);
  parent.add(group);

  return {
    interactives: [magnifierModel.clickable],
  };
}

function addBed(parent) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.3, 1.2),
    makeMaterial(0x4b2f24)
  );
  base.position.y = 0.2;
  group.add(base);

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.22, 1.05),
    makeMaterial(0x6f7dd7)
  );
  mattress.position.set(0, 0.45, 0);

  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.13, 0.36),
    makeMaterial(0xdce7ff)
  );
  pillow.position.set(-0.45, 0.63, -0.25);

  group.add(mattress, pillow);
  parent.add(group);
}

function addShelf(parent) {
  const group = new THREE.Group();

  const woodOuter = makeMaterial(0xad986f);
  const woodInner = makeMaterial(0x907c58);

  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.72, 0.42), woodOuter);
  leftSide.position.set(-0.56, 1.36, 0);
  const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.72, 0.42), woodOuter);
  rightSide.position.set(0.56, 1.36, 0);

  const topBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.42), woodOuter);
  topBoard.position.set(0, 2.68, 0);
  const bottomBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.42), woodOuter);
  bottomBoard.position.set(0, 0.04, 0);

  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 2.54, 0.02),
    makeMaterial(0x6f6046)
  );
  backPanel.position.set(0, 1.36, -0.19);

  group.add(leftSide, rightSide, topBoard, bottomBoard, backPanel);

  const shelfLevels = [0.56, 1.08, 1.6, 2.12];
  for (const y of shelfLevels) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.06, 0.38),
      woodInner
    );
    shelf.position.set(0, y, 0);
    group.add(shelf);
  }

  for (let i = 0; i < shelfLevels.length - 1; i++) {
    const startX = -0.46;
    const bookCount = 8;
    for (let j = 0; j < bookCount; j++) {
      const width = 0.08 + Math.random() * 0.03;
      const height = 0.24 + Math.random() * 0.15;
      const depth = 0.2 + Math.random() * 0.03;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        makeMaterial(new THREE.Color().setHSL(0.08 + Math.random() * 0.5, 0.65, 0.68))
      );
      const x = startX + j * 0.115;
      const y = shelfLevels[i] + 0.03 + height / 2;
      book.position.set(x, y, 0.02 + (Math.random() - 0.5) * 0.04);
      book.rotation.z = (Math.random() - 0.5) * 0.18;
      group.add(book);
    }
  }

  const decorSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 10),
    makeMaterial(0x5ea8ff, 0x356fd1)
  );
  decorSphere.position.set(-0.2, 2.77, 0.08);

  const decorCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.11, 8),
    makeMaterial(0xf4cf62)
  );
  decorCone.position.set(0.08, 2.77, 0.08);

  const decorPlantPot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.045, 0.06, 10),
    makeMaterial(0xc79565)
  );
  decorPlantPot.position.set(0.34, 2.73, 0.08);
  const decorPlantLeaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 8),
    makeMaterial(0x5cd08d)
  );
  decorPlantLeaf.position.set(0.34, 2.79, 0.08);

  group.add(decorSphere, decorCone, decorPlantPot, decorPlantLeaf);

  parent.add(group);
}

function addCharacter(parent) {
  const group = new THREE.Group();

  const skinMat = makeMaterial(0xf1cfb4);
  const hairMat = makeMaterial(0x32231b);
  const shirtMat = makeMaterial(0x4f64df);
  const pantsMat = makeMaterial(0x2f4a8f);
  const shoeMat = makeMaterial(0x191d2f);
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 0.28, metalness: 0.02 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x1a2138, roughness: 0.2, metalness: 0.04 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.45, metalness: 0.02 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0xbe7471, roughness: 0.5, metalness: 0.01 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.3), shirtMat);
  body.position.set(0, 0.9, 0.03);
  body.rotation.z = 0.02;

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.1), skinMat);
  neck.position.set(0, 1.16, 0.02);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.29, 0.3), skinMat);
  head.position.set(0, 1.33, 0.02);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.11, 0.33), hairMat);
  hairTop.position.set(0, 1.47, 0.02);

  // Thicker back and side hair to avoid bare back-head view.
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.09), hairMat);
  hairBack.position.set(0, 1.33, -0.125);

  const hairSideLeft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.19, 0.08), hairMat);
  hairSideLeft.position.set(-0.148, 1.31, 0.0);

  const hairSideRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), hairMat);
  hairSideRight.position.set(0.145, 1.33, 0.0);

  const bangsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.05), hairMat);
  bangsLeft.position.set(-0.072, 1.37, 0.155);
  bangsLeft.rotation.z = 0.08;

  const bangsCenter = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.05), hairMat);
  bangsCenter.position.set(0.01, 1.362, 0.156);
  bangsCenter.rotation.z = -0.05;

  const earLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.04), skinMat);
  earLeft.position.set(-0.168, 1.295, 0.01);

  const earRight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.065, 0.04), skinMat);
  earRight.position.set(0.168, 1.302, 0.01);

  const eyeLeftWhite = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.026, 0.012), eyeWhiteMat);
  eyeLeftWhite.position.set(-0.055, 1.318, 0.171);

  const eyeRightWhite = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.026, 0.012), eyeWhiteMat);
  eyeRightWhite.position.set(0.055, 1.318, 0.171);

  const eyeLeftPupil = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.014), eyePupilMat);
  eyeLeftPupil.position.set(-0.053, 1.317, 0.177);

  const eyeRightPupil = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.014), eyePupilMat);
  eyeRightPupil.position.set(0.053, 1.317, 0.177);

  const browLeft = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.012), browMat);
  browLeft.position.set(-0.055, 1.348, 0.171);
  browLeft.rotation.z = 0.06;

  const browRight = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.012), browMat);
  browRight.position.set(0.055, 1.347, 0.171);
  browRight.rotation.z = -0.04;

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), mouthMat);
  mouth.position.set(0, 1.262, 0.171);

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.05), makeMaterial(0xecf1ff));
  collar.position.set(0, 1.11, 0.145);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.18, 0.22), pantsMat);
  hips.position.set(0, 0.63, 0.05);

  const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.14), pantsMat);
  leftThigh.position.set(-0.085, 0.46, 0.09);
  leftThigh.rotation.x = -0.42;

  const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.14), pantsMat);
  rightThigh.position.set(0.085, 0.47, 0.08);
  rightThigh.rotation.x = -0.34;

  const leftCalf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.11), pantsMat);
  leftCalf.position.set(-0.085, 0.24, 0.22);
  leftCalf.rotation.x = 0.2;

  const rightCalf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.11), pantsMat);
  rightCalf.position.set(0.085, 0.24, 0.2);
  rightCalf.rotation.x = 0.12;

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), shoeMat);
  leftShoe.position.set(-0.085, 0.07, 0.28);

  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), shoeMat);
  rightShoe.position.set(0.085, 0.07, 0.25);

  // Shoulder pivots to make animation feel like real shoulder sway.
  const leftUpperArm = new THREE.Group();
  leftUpperArm.position.set(-0.25, 1.04, 0.03);
  const leftUpperArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.21, 0.1), shirtMat);
  leftUpperArmMesh.position.set(0, -0.105, 0);
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.19, 0.09), skinMat);
  leftForearm.position.set(0.0, -0.265, 0.06);
  leftForearm.rotation.x = -0.45;
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.09), skinMat);
  leftHand.position.set(0.0, -0.37, 0.1);
  leftUpperArm.add(leftUpperArmMesh, leftForearm, leftHand);
  leftUpperArm.rotation.z = 0.22;
  leftUpperArm.rotation.x = -0.18;

  const rightUpperArm = new THREE.Group();
  rightUpperArm.position.set(0.25, 1.04, 0.03);
  const rightUpperArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.21, 0.1), shirtMat);
  rightUpperArmMesh.position.set(0, -0.105, 0);
  const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.19, 0.09), skinMat);
  rightForearm.position.set(0.0, -0.26, 0.055);
  rightForearm.rotation.x = -0.4;
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.09), skinMat);
  rightHand.position.set(0.0, -0.36, 0.09);
  rightUpperArm.add(rightUpperArmMesh, rightForearm, rightHand);
  rightUpperArm.rotation.z = -0.19;
  rightUpperArm.rotation.x = -0.16;

  const chair = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.08, 0.62),
    makeMaterial(0x23253f)
  );
  chair.position.y = 0.28;

  const chairBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.08),
    makeMaterial(0x2a2d48)
  );
  chairBack.position.set(0, 0.55, -0.2);

  const chairLegL = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.25, 0.08),
    makeMaterial(0x171a28)
  );
  chairLegL.position.set(-0.2, 0.12, 0.12);

  const chairLegR = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.25, 0.08),
    makeMaterial(0x171a28)
  );
  chairLegR.position.set(0.2, 0.12, 0.12);

  group.add(
    chair,
    chairBack,
    chairLegL,
    chairLegR,
    body,
    neck,
    head,
    hairTop,
    hairBack,
    hairSideLeft,
    hairSideRight,
    bangsLeft,
    bangsCenter,
    earLeft,
    earRight,
    eyeLeftWhite,
    eyeRightWhite,
    eyeLeftPupil,
    eyeRightPupil,
    browLeft,
    browRight,
    mouth,
    collar,
    hips,
    leftThigh,
    rightThigh,
    leftCalf,
    rightCalf,
    leftShoe,
    rightShoe,
    leftUpperArm,
    rightUpperArm
  );
  parent.add(group);

  return {
    leftUpperArm,
    rightUpperArm,
  };
}

function addPicture(parent) {
  const screenTexture = createZhenfengTowerArtTexture();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.06),
    makeMaterial(0xcdad69)
  );
  frame.position.set(0, 2.05, -3.46);

  const art = new THREE.Mesh(
    new THREE.BoxGeometry(1.26, 0.76, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: screenTexture,
      roughness: 0.45,
      metalness: 0.08,
      emissive: 0x1f3f66,
      emissiveIntensity: 0.25,
    })
  );
  art.position.set(0, 2.05, -3.42);

  parent.add(frame, art);
}

function createZhenfengTowerArtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const sky = ctx.createLinearGradient(0, 0, 0, 420);
  sky.addColorStop(0, '#8fb4d8');
  sky.addColorStop(0.55, '#6f95bf');
  sky.addColorStop(1, '#4f759f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 420);

  const haze = ctx.createRadialGradient(760, 130, 30, 760, 130, 280);
  haze.addColorStop(0, 'rgba(255,255,255,0.46)');
  haze.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, 1024, 420);

  ctx.fillStyle = '#37577b';
  ctx.fillRect(0, 360, 1024, 280);

  const water = ctx.createLinearGradient(0, 360, 0, 640);
  water.addColorStop(0, '#5f85af');
  water.addColorStop(1, '#2f4f73');
  ctx.fillStyle = water;
  ctx.fillRect(0, 360, 1024, 280);

  // Shoreline silhouettes
  ctx.fillStyle = 'rgba(35,55,78,0.72)';
  ctx.fillRect(0, 332, 1024, 36);
  ctx.fillStyle = 'rgba(26,40,58,0.65)';
  for (let i = 0; i < 14; i++) {
    const w = 42 + (i % 3) * 16;
    const h = 22 + (i % 5) * 8;
    ctx.fillRect(30 + i * 72, 332 - h, w, h);
  }

  const cx = 520;
  const baseY = 335;
  const floors = 8;

  function drawTowerSegment(width, yTop, yBottom, roofRise) {
    const roofY = yTop - roofRise;
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.62, yTop + 4);
    ctx.lineTo(cx, roofY);
    ctx.lineTo(cx + width * 0.62, yTop + 4);
    ctx.lineTo(cx + width * 0.56, yTop + 9);
    ctx.lineTo(cx - width * 0.56, yTop + 9);
    ctx.closePath();
    ctx.fillStyle = '#4f2f1f';
    ctx.fill();

    ctx.fillStyle = '#d7b980';
    ctx.fillRect(cx - width * 0.45, yTop + 9, width * 0.9, yBottom - (yTop + 9));
    ctx.strokeStyle = 'rgba(90,60,35,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - width * 0.45, yTop + 9, width * 0.9, yBottom - (yTop + 9));
  }

  for (let i = 0; i < floors; i++) {
    const t = i / (floors - 1);
    const width = 190 - i * 18;
    const yBottom = baseY - i * 30;
    const yTop = yBottom - 24;
    drawTowerSegment(width, yTop, yBottom, 12 - t * 3);
  }

  // Tower spire
  ctx.fillStyle = '#8f6d3b';
  ctx.fillRect(cx - 3, 78, 6, 28);
  ctx.beginPath();
  ctx.moveTo(cx, 54);
  ctx.lineTo(cx - 8, 78);
  ctx.lineTo(cx + 8, 78);
  ctx.closePath();
  ctx.fillStyle = '#b99760';
  ctx.fill();

  // Reflection
  ctx.save();
  ctx.translate(0, 690);
  ctx.scale(1, -0.55);
  ctx.globalAlpha = 0.2;
  ctx.filter = 'blur(2px)';
  for (let i = 0; i < floors; i++) {
    const width = 190 - i * 18;
    const yBottom = baseY - i * 30;
    const yTop = yBottom - 24;
    drawTowerSegment(width, yTop, yBottom, 10);
  }
  ctx.restore();

  // Gentle rain texture for a moody artistic look.
  ctx.strokeStyle = 'rgba(235,245,255,0.09)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 170; i++) {
    const x = (i * 61) % 1024;
    const y = (i * 37) % 640;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10, y + 24);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addWindow(parent) {
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.88, 0.06),
    makeMaterial(0x4a5db8)
  );
  frame.position.set(-3.45, 1.85, -1.1);
  frame.rotation.y = Math.PI / 2;

  const panel1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.78, 0.02),
    makeMaterial(0xb8d7ff, 0x5aa0ff)
  );
  panel1.position.set(-3.42, 1.85, -1.24);
  panel1.rotation.y = Math.PI / 2;

  const panel2 = panel1.clone();
  panel2.position.z = -0.95;

  parent.add(frame, panel1, panel2);
}

function addPlants(parent) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.2, 10),
    makeMaterial(0xbb8b5f)
  );
  pot.position.set(-2.3, 0.1, 1.7);

  const leafMat = makeMaterial(0x63d298);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), leafMat);
    leaf.position.set(-2.3 + (Math.random() - 0.5) * 0.22, 0.28 + i * 0.05, 1.7 + (Math.random() - 0.5) * 0.22);
    parent.add(leaf);
  }

  parent.add(pot);
}

function addStars(scene) {
  const starGeo = new THREE.BufferGeometry();
  const points = [];

  for (let i = 0; i < 420; i++) {
    points.push((Math.random() - 0.5) * 18, Math.random() * 7 + 0.2, (Math.random() - 0.5) * 18);
  }

  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xb7c8ff, size: 0.04, transparent: true, opacity: 0.8 });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  return stars;
}

function createFloorTileTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base tone for tiles.
  ctx.fillStyle = '#465596';
  ctx.fillRect(0, 0, size, size);

  const tile = 64;
  const grout = 2;

  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const lightness = 52 + ((x / tile + y / tile) % 2 === 0 ? 3 : -2);
      ctx.fillStyle = `hsl(228, 33%, ${lightness}%)`;
      ctx.fillRect(x + grout, y + grout, tile - grout * 2, tile - grout * 2);
    }
  }

  ctx.strokeStyle = 'rgba(22, 30, 62, 0.65)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += tile) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.3, 3.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addBaseboards(parent) {
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x8f9ace, roughness: 0.82, metalness: 0.03 });

  const backBoard = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.12, 0.08), boardMat);
  backBoard.position.set(0, 0.06, -3.45);

  const leftBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 8.8), boardMat);
  leftBoard.position.set(-3.45, 0.06, 0.8);

  const rightBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 8.8), boardMat);
  rightBoard.position.set(3.45, 0.06, 0.8);

  parent.add(backBoard, leftBoard, rightBoard);
}

function createFloorPerspectiveGuide() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0xcad7ff, transparent: true, opacity: 0.16 });
  const y = 0.012;
  const frontZ = 4.2;
  const backZ = -4.1;

  for (let x = -3.2; x <= 3.2; x += 0.4) {
    const points = [
      new THREE.Vector3(x, y, frontZ),
      new THREE.Vector3(x * 0.2, y, backZ),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }

  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const z = frontZ + (backZ - frontZ) * Math.pow(t, 1.42);
    const halfWidth = 3.25 * (1 - t * 0.72);
    const points = [
      new THREE.Vector3(-halfWidth, y, z),
      new THREE.Vector3(halfWidth, y, z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }

  return group;
}

export function initHome3DRoom() {
  const mount = document.getElementById('room-canvas');
  const cardTitle = document.getElementById('room-card-title');
  const cardText = document.getElementById('room-card-text');
  const hotspotWrap = document.getElementById('room-hotspots');
  if (!mount || !cardTitle || !cardText || !hotspotWrap) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070e3f);
  scene.fog = new THREE.Fog(0x070e3f, 8, 20);

  const camera = new THREE.PerspectiveCamera(56, mount.clientWidth / mount.clientHeight, 0.1, 80);
  camera.position.set(0.9, 2.05, 7.1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 4;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 1.5, 0);

  const hemiLight = new THREE.HemisphereLight(0x6f88ff, 0x27315f, 0.75);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0x41528f, 0.45);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xdbe8ff, 1.3);
  dirLight.position.set(2.8, 5.5, 4.2);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 20;
  scene.add(dirLight);

  const room = new THREE.Group();

  const floorMap = createFloorTileTexture();
  if (floorMap) {
    floorMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 9),
    new THREE.MeshStandardMaterial({
      color: 0x5665ab,
      map: floorMap || null,
      roughness: 0.93,
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x6b45a6, roughness: 0.9, metalness: 0 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, 1.2);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f3470, roughness: 0.9 })
  );
  backWall.position.set(0, 3, -3.5);

  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({ color: 0x2d3272, roughness: 0.9 })
  );
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-3.5, 3, 0.8);

  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({ color: 0x1e2460, roughness: 0.9 })
  );
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(3.5, 3, 0.8);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 9),
    new THREE.MeshStandardMaterial({ color: 0x262d63, roughness: 1 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 5.95, 0.8);

  room.add(floor, rug, backWall, leftWall, rightWall, ceiling);
  addBaseboards(room);
  room.add(createFloorPerspectiveGuide());

  const deskWrap = new THREE.Group();
  deskWrap.position.set(0.2, 0, -1.0);
  const deskMeta = addTable(deskWrap);
  room.add(deskWrap);

  const bedWrap = new THREE.Group();
  bedWrap.position.set(-2.1, 0, -0.8);
  addBed(bedWrap);
  room.add(bedWrap);

  const shelfWrap = new THREE.Group();
  shelfWrap.position.set(2.65, 0, -1.0);
  addShelf(shelfWrap);
  room.add(shelfWrap);

  addPicture(room);
  addWindow(room);
  addPlants(room);

  const charWrap = new THREE.Group();
  charWrap.position.set(1.5, 0, 0.8);
  const characterRig = addCharacter(charWrap);
  room.add(charWrap);

  room.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  scene.add(room);

  const stars = addStars(scene);

  const anchors = {
    about: new THREE.Object3D(),
    skills: new THREE.Object3D(),
    projects: new THREE.Object3D(),
    contact: new THREE.Object3D(),
  };

  anchors.about.position.set(-0.8, 3.0, -3.2);
  anchors.skills.position.set(2.4, 2.5, -2.2);
  anchors.projects.position.set(0.0, 1.55, -0.3);
  anchors.contact.position.set(2.1, 1.5, -1.6);

  Object.values(anchors).forEach(anchor => scene.add(anchor));

  const interactiveTargets = [...(deskMeta?.interactives || [])];

  const hotspotButtons = new Map();
  hotspotWrap.querySelectorAll('.room-hotspot').forEach((btn) => {
    const key = btn.dataset.hotspot;
    if (key) {
      hotspotButtons.set(key, btn);
      btn.addEventListener('click', () => {
        const content = INFO_CONTENT[key];
        if (!content) return;

        cardTitle.textContent = content.title;
        cardText.textContent = content.text;

        hotspotButtons.forEach((el, id) => {
          el.classList.toggle('is-active', id === key);
        });
      });
    }
  });

  const temp = new THREE.Vector3();

  function updateHotspots() {
    const rect = mount.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    for (const [key, button] of hotspotButtons) {
      const anchor = anchors[key];
      if (!anchor) continue;

      temp.setFromMatrixPosition(anchor.matrixWorld).project(camera);

      const visible = temp.z < 1 && temp.z > -1;
      if (!visible) {
        button.style.opacity = '0';
        button.style.pointerEvents = 'none';
        continue;
      }

      const x = (temp.x * 0.5 + 0.5) * width;
      const y = (-temp.y * 0.5 + 0.5) * height;

      button.style.opacity = '1';
      button.style.pointerEvents = 'auto';
      button.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  function onResize() {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragState = { x: 0, y: 0, moved: false };

  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragState.x = e.clientX;
    dragState.y = e.clientY;
    dragState.moved = false;
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - dragState.x) > 6 || Math.abs(e.clientY - dragState.y) > 6) {
      dragState.moved = true;
    }
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (dragState.moved) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveTargets, false);
    if (hits.length === 0) return;

    const action = hits[0].object.userData.action;
    if (action === 'open-search') {
      window.dispatchEvent(new CustomEvent('room:open-search'));
    }
  });

  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();

  function animate() {
    const t = clock.getElapsedTime();
    stars.rotation.y = t * 0.03;
    stars.rotation.x = Math.sin(t * 0.08) * 0.03;

    if (characterRig) {
      characterRig.leftUpperArm.rotation.z = 0.22 + Math.sin(t * 1.2) * 0.026;
      characterRig.leftUpperArm.rotation.x = -0.18 + Math.cos(t * 1.05) * 0.014;
      characterRig.rightUpperArm.rotation.z = -0.19 - Math.sin(t * 1.2 + 0.4) * 0.026;
      characterRig.rightUpperArm.rotation.x = -0.16 + Math.cos(t * 1.05 + 0.32) * 0.014;
    }

    controls.update();
    updateHotspots();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();

  const defaultBtn = hotspotButtons.get('about');
  if (defaultBtn) defaultBtn.click();
}
