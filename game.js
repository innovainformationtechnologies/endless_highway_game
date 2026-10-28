import { AudioSystem } from "./scripts/audioSystem.js"

let version = "0.1.1";
let three, camera, renderer;
let audio
let scene = [];
let player;
let laneX = [-2, 0, 2];
let currentLane = 1;
let activeObstacles = [];
let score = 0;
let scrapes = 0;
let gameOver = false;
let paused = true;
let debug = true;
let tokens = localStorage.getItem("tokens") ? Number(localStorage.getItem("tokens")) : 25
let run_distance = 0;
let maxTrafficSpacing = 20
let minTrafficSpacing = 4
let trafficDensity = 5
let spawnDist = 100
let spawnChance = 2

// Speeds
let baseSpeed = 1.0;
let speed = baseSpeed;
let baseFov = 40;
let cameraPos = {x:0, y:3, z:10}

// Combo system
let combo = 0;
let lastNearMiss = null;
const comboTimeout = 10.0; // seconds without near-miss resets combo
const proximityBoxSize = { x: 5, y: 1, z: 7 }; // lane width, height, forward/back
const scrapeBoxSize = { x: 4, y: 1, z: 2.5 }; // scrape box size
let scrapeBoxOffsetZ = .5; // scrape box offset

function getCallerLine() {
  const err = new Error();
  const stackLines = err.stack.split('\n');
  // stackLines[0] is "Error"
  // stackLines[1] is the current function (getCallerLine)
  // stackLines[2] is the calling function
  const callerLine = stackLines[2];
  return callerLine;
}

function debugLog(message,caller){
    if (debug)
        console.log(caller+": "+message+"\n"+getCallerLine())
}

class Car {
    constructor(name="Car"+Math.random()%9999+1111, update = () => {}, audio = () => {}, options = { color: 0xaaaaaa, weight: 40, power:55, durability:15, size:50, friction:0.5}) {
        this.name = name
        this.options = options;
        this.state = Object.create(options);
        this.updateFunc = update;
        this.audio = audio;
        
        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry((options.size*.01)*2, options.size*.01, (options.size*.01)*4),
            new THREE.MeshStandardMaterial({ color: this.state.color })
        );


        this.mesh.position.y = 0.25;
        
    }

    update(delta){
        this.updateFunc(this, delta);
    }

    updateAudio(){
        this.audio(this)
    }
    
    reset(){
        this.state.durability = this.options.durability;
        this.state.crashed = false
        this.state.scraped = false
        this.state.passed = false
    }

    setPosition(x, z) {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    }

    setMomentumX(x) {
        this.state.momentumX = x;
    }

    boostZ(z){
        speed += z
    }

    move(delta, speed) {
        let new_pos = speed * delta
        // debugLog("moving " + new_pos, this.name);
        this.mesh.position.z += new_pos;
    }

    getBoundingBox() {
    return new THREE.Box3().setFromObject(this.mesh);
    }
}

function checkRearCollision(carA, carB) {
    return carA.getBoundingBox().intersectsBox(carB.getBoundingBox());
}

function getProximityBox() {
    const box = new THREE.Box3();
    box.setFromCenterAndSize(
    player.mesh.position,
    new THREE.Vector3((player.state.size*.01)*proximityBoxSize.x, ((player.state.size*.01))*proximityBoxSize.y, ((player.state.size*.01))*proximityBoxSize.z)
    );
    return box;
}

function getScrapeBox() {
    const box = new THREE.Box3();
    let center = player.mesh.position.clone();
    debugLog(scrapeBoxOffsetZ, "get scrape box");
    center.setZ(scrapeBoxOffsetZ)
    let size = new THREE.Vector3((player.state.size*.01)*scrapeBoxSize.x, ((player.state.size*.01))*scrapeBoxSize.y, ((player.state.size*.01))*scrapeBoxSize.z);
    box.setFromCenterAndSize(center, size)
    return box;
}

function checkNearMiss(proxBox, car) {
    if (car != lastNearMiss && proxBox.intersectsBox(car.getBoundingBox())){
        lastNearMiss = car
        return true;
    }
}

function checkScrape(scrapeBox, car, intersectsBox) {
    return scrapeBox.intersectsBox(car.getBoundingBox(), intersectsBox);
}

function calculateNearMiss(player, car) {
    const distance = car.mesh.position.z - player.mesh.position.z;
    const maxDistance = proximityBoxSize.z / 2;
    let points = Math.max(1, Math.floor((1 - Math.abs(distance) / maxDistance) * 5)); 
    points *= (1 + combo * 0.5); // combo multiplier
    debugLog(points + " points for " + distance + " distance", "Near Miss Calc");
    return points;
}

function updateNPCCar(car) {
    // scene.add(car.mesh);
    car.state.passed = false
}
function updatePlayerCar(car, delta) {
    if (!car.state.momentumX)
        car.state.momentumX = 0;
    // debugLog(car.options, car.name + "update")
    if (car.state.durability < 0){
        car.mesh.material.color.set(0xff0000);
    }
    else if (car.state.durability < 15){
        car.mesh.material.color.set(0xffaa00);
        car.state.durability += delta * 1.5;
    }
    else {
        car.mesh.material.color.set(car.options.color);
    }
    // Smooth lane movement
    const targetX = laneX[currentLane];
    let laneDelta = targetX - player.mesh.position.x;
    
    let accel = laneDelta * (player.state.power/player.state.weight) - ((player.state.friction)*player.state.weight) * player.state.momentumX ;
    player.state.momentumX += accel * delta;
    
    player.mesh.position.x += player.state.momentumX;

    car.state.crashed = false
    car.state.scraped = false
}

function NPCAudio(car){
    let directionToPlayer
    if (car.state.passed){
        debugLog("woosh", "PLAYING SOUND")
        audio.playOneShot("woosh", 1.0, 0, directionToPlayer)
    }
}

function playerAudio(car){
    if (car.state.crashed){
        debugLog("crash", "PLAYING SOUND")
        audio.playOneShot("crash")
    }
    if (car.state.scraped){
        debugLog("scrape", "PLAYING SOUND")
        audio.playOneShot("scrape")
    }
}


function spawnCar(car, lane, z) {
    debugLog("spawning car", "Car Spawn");
    car.setPosition(lane, z);
    three.add(car.mesh);
    scene.push(car);
}

function createAudio(){
    document.getElementById("welcome").innerText = "Loading: Initializing audio system"
    audio = new AudioSystem()
    document.getElementById("welcome").innerText = "Loading: audio context state = " + audio.ctx.state
    audio.ctx.resume()
    document.getElementById("welcome").innerText = "Loading: audio context state = " + audio.ctx.state
    // play intro sound
    document.getElementById("welcome").innerText = ""
    setupScene();
}

function setupScene() {
    three = new THREE.Scene();
    three.background = new THREE.Color(0x0a0a44); // deep summer-night blue

    camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    audio.loadSound("woosh", "./static/audio/425705__moogy73__woosh_medium_03.wav")
    audio.loadSound("scrape", "./static/audio/682371__pnmcarrierailfan__car-crash-elements-sideswipe-01.mp3")
    audio.loadSound("crash", "./static/audio/807437__logicogonist__car-crash-long-1.wav")
    
    // Ground
    const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2000),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -950;
    three.add(ground);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    three.add(light);
    three.add(new THREE.AmbientLight(0x404040));

    // Player
    player = new Car("Player", updatePlayerCar, playerAudio, { color: 0xaaaaaa, weight: 120, power:1830, durability:15, size:50, friction:0.2});
    spawnCar(player, 1, 0);

    // Touch buttons
    document.getElementById('leftBtn').addEventListener('touchstart', () => moveLeft(), { passive: false });
    document.getElementById('rightBtn').addEventListener('touchstart', () => moveRight(), { passive: false });
    document.getElementById('exit').addEventListener('click', () => showMenu(), { passive: false });
    
    // sliders
    document.getElementById('power').addEventListener('input', e => player.state.power = Number(e.target.value));
    document.getElementById('weight').addEventListener('input', e => player.state.weight = Number(e.target.value));
    document.getElementById('friction').addEventListener('input', e => player.state.friction = Number(e.target.value));
    document.getElementById('scrape_box_offset').addEventListener('input', e => scrapeBoxOffsetZ = Number(e.target.value));
    document.getElementById('traffic_density').addEventListener('input', e => trafficDensity = Number(e.target.value));
    document.getElementById('power').value = player.state.power;
    document.getElementById('weight').value = player.state.weight;
    document.getElementById('friction').value = player.state.friction;
    document.getElementById('scrape_box_offset').value = scrapeBoxOffsetZ;
    document.getElementById('traffic_density').value = trafficDensity;

    // Keyboard
    window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft();
    if (e.key === 'ArrowRight' || e.key === 'd') moveRight();
    if (e.key === 'p') togglePause();
    if (e.key === 'q') showMenu();
    });

    window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    });
    animate()
    showMenu()
}

function moveLeft() { let previousLane = currentLane; currentLane = Math.max(0, currentLane - 1); }
function moveRight() { let previousLane = currentLane; currentLane = Math.min(laneX.length - 1, currentLane + 1); }

let lastSpawnDist = 0;
function spawnObstacle() {
    if (Math.random() > spawnChance) return
    if (run_distance - lastSpawnDist < 5) return // at least 1 car space
    let name = "NPC"+Math.floor(Math.random()%9999+1111*1000);
    const car = new Car(name, updateNPCCar, NPCAudio, { color: 0xffffff, weight: 40, power:55, durability:15, size:50, friction:0.5});
    const lane = laneX[Math.floor(Math.random() * laneX.length)];
    spawnCar(car, lane, camera.position.z - spawnDist);
    activeObstacles.push(car);
    lastSpawnDist = run_distance;
}

function adjustDifficulty(){
    trafficDensity = Math.random() % maxTrafficSpacing + minTrafficSpacing;
    debugLog("traffic density: " + trafficDensity);
    setTimeout(() => {
        adjustDifficulty();
    }, 1000);
}

function stepPhysics(delta) {
    // Random spawn: 2% chance per frame
    spawnObstacle();
    

    const proxBox = getProximityBox();
    const scrapeBox = getScrapeBox();
    
    const accel = (player.state.power/player.state.weight)-(player.state.friction*(speed**2)) ;
    speed += accel*delta;

    for (let i = activeObstacles.length - 1; i >= 0; i--) {
        const car = activeObstacles[i];
        car.move(delta, speed);
        checkCollisions(proxBox, scrapeBox, car);
        if (car.mesh.position.z > camera.position.z + 50) {
            debugLog("you passed a car", "Pass Check");
            three.remove(car.mesh);
            activeObstacles.splice(i, 1);
        }
    }
    
    run_distance += speed * delta;
}

function checkCollisions(proxBox, scrapeBox, car){
    const currentTime = performance.now();

    if (checkNearMiss(proxBox, car)) {
        let points = calculateNearMiss(player, car, currentTime);
        combo ++
        car.state.passed = true
        // let intersectsBox = new THREE.Box3()000
        if (checkScrape(scrapeBox, car)) {
            if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
                localStorage.setItem('high_combo', combo);
            }
            // debugLog(intersectsBox, "Scraping")
            // bump player away from obstacle
            // let direction = Math.sign(player.mesh.position.x-car.mesh.position.x)
            // let lane = currentLane + direction;
            // if (lane < 0) lane = laneX.length - 1;
            // if (lane > laneX.length - 1) lane = 0;
            // currentLane = lane;
            // player.setMomentumX(0);
            // player.setPosition(laneX[currentLane], player.mesh.position.z);
            player.boostZ((player.state.power/player.state.weight))
            player.state.scraped = true
            player.state.durability -= 15;
            speed *= .7;
            camera.setFocalLength(baseFov) + 2
            camera.position.z = cameraPos.z + 2
            scrapes++;
            combo = 0;
            debugLog("you scraped " + scrapes + " times ", "Scrape Check");
            return
        }
        let newPoitns = points * speed * combo;
        debugLog("+"+ newPoitns, " you're swimming");
        score += newPoitns
    }
    
    if (checkRearCollision(player, car)) {
            debugLog("you crashed", "Rear Col Check");
            player.state.crashed = true
            player.state.durability -= 30;
            speed = 0
            if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
                localStorage.setItem('high_combo', combo);
            }
            combo = 0;
    }
    
}

function updateScene(delta){
    scene.forEach(obj => {
        if (obj.update) obj.update(delta);
    });
    if (player.state.durability < 0){
        gameOver = true;
        paused = true;
        resetGame();
        return;
    }
    let speedZoomAmnt = baseFov - (speed - baseSpeed) * 1.8
    // debugLog("Speed zoom amnt " + speedZoomAmnt, "Update Scene")
    camera.setFocalLength(speedZoomAmnt)
    camera.position.z = cameraPos.z - ((speed - baseSpeed)*.5)
}

function updateUI(delta){
    if (paused){
        document.querySelector('#high_score').innerText = "High Score: " + Math.floor(localStorage.getItem("high_score")) + " High Combo: " + localStorage.getItem("high_combo") + " Max Distance: " + Math.floor(localStorage.getItem("high_run_distance")) + " Tokens: " + tokens;
        
    }
    if (paused == false)
        document.querySelector('#score').innerText = "Score: " + Math.floor(score) + " Combo: " + combo + " Speed: " + Math.floor(speed*10) + " Distance: " + Math.floor(run_distance) + " Tokens: " + tokens;
    document.getElementById('power_label').innerText = "Power: " + player.state.power;
    document.getElementById('weight_label').innerText = "Weight: " + player.state.weight*10;
    document.getElementById('friction_label').innerText = "Friction: " + player.state.friction;
    document.getElementById('scrape_box_offset_label').innerText = "Scrape Box Offset: " + scrapeBoxOffsetZ;
    document.getElementById('traffic_density_label').innerText = "Traffic Density: " + trafficDensity;
}

function updateAudio(){
    scene.forEach(obj=>{
        if (obj.updateAudio) obj.updateAudio()
    })
}

function pause(){
    paused = true;
}
function unpause(){
    paused = false;
}
function togglePause(){
    paused = !paused;
}

function resetGame() {
    if (tokens <= 0) showMenu();
    scene = [];
    if (gameOver){
        if (localStorage.getItem('high_score') < score || localStorage.getItem('high_score') == null){
            localStorage.setItem('high_score', Math.floor(score));
        }
        score = 0;
        if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
            localStorage.setItem('high_combo', combo);
        }
        combo = 0;
        if (localStorage.getItem('max_scrapes') < scrapes || localStorage.getItem('high_scrapes') == null){
            localStorage.setItem('max_scrapes', scrapes);
        }
        scrapes = 0;
        if (localStorage.getItem('high_run_distance') < run_distance || localStorage.getItem('high_run_distance') == null){
            localStorage.setItem('high_run_distance', run_distance.toFixed(2));
        }
        run_distance = 0;
        lastSpawnDist = 0;
    };
    gameOver = false;
    player.reset();
    spawnCar(player, laneX[currentLane], 0);
    setTimeout(() => {
        paused = false;
        tokens -= 1
        localStorage.setItem("tokens", tokens);
        activeObstacles.forEach(car => three.remove(car.mesh));
        activeObstacles = [];
        currentLane = 1;
        speed = baseSpeed;
        player.state.crashed = false
        player.state.scraped = false
    }, 1000);
}

let lastTime = 0.016;
function animate(time) {
    requestAnimationFrame(animate);
    
    if (tokens < 0) showMenu(); // check game over at start
    
    
    if (lastTime == 0) lastTime = time;
    const delta = (time - lastTime)*.001; 
    // debugLog(delta);
        
    if (!paused){
        stepPhysics(delta);
        updateAudio();
        updateScene(delta);
    }
    updateUI(delta);
    if (debug){
        // draw proximity box
        // 1. Call the function to get your Box3 instance
        const proxBox3 = getProximityBox();

        // 2. Extract the physical size and center point from it
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();

        proxBox3.getSize(size);
        proxBox3.getCenter(center);

        // 3. Create the geometry matching those exact dimensions
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);

        // 4. Create your material (using a transparent wireframe look is common for proximity zones)
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            wireframe: true 
        });

        // 5. Build the mesh and position it at the center of the Box3
        const proximityVisualMesh = new THREE.Mesh(geometry, material);
        proximityVisualMesh.position.copy(center);

        // 6. Add it to your rendering scene loop
        three.add(proximityVisualMesh);

 
        // draw scrape box
        const scrapeBox = getScrapeBox();
        // 2. Extract the physical size and center point from it
        const scrapeSize = new THREE.Vector3();
        const scrapeCenter = new THREE.Vector3();

        scrapeBox.getSize(scrapeSize);
        scrapeBox.getCenter(scrapeCenter);

        // 3. Create the geometry matching those exact dimensions
        const scrapeGeometry = new THREE.BoxGeometry(scrapeSize.x, scrapeSize.y, scrapeSize.z);

        // 4. Create your material (using a transparent wireframe look is common for proximity zones)
        const scrapeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            wireframe: true 
        });

        // 5. Build the mesh and position it at the center of the Box3
        const scrapeVisualMesh = new THREE.Mesh(scrapeGeometry, scrapeMaterial);
        scrapeVisualMesh.position.copy(scrapeCenter);

        // 6. Add it to your rendering scene loop
        three.add(scrapeVisualMesh);
        renderer.render(three, camera);
        // Remove debug visuals
        three.remove(proximityVisualMesh);
        three.remove(scrapeVisualMesh);
    } else {
        renderer.render(three, camera);
    }
    lastTime = time;
}

function startGame(){
    if (tokens <= 0){
        tokens=0;
        let more_tokens = confirm("You have no tokens to play with. Watch an ad for more!", "Watch an ad for more!");
        if (more_tokens){
            tokens += 10
            alert("adding 10 tokens. you now have " + tokens);
            localStorage.setItem("tokens", tokens);
        }
        return;
    }
    debugLog("starting game");
    if (debug){
        document.getElementById("tuner").classList.add("visible")
    }
    setTimeout(()=>{
        document.getElementById("help").classList.add("hide")
    }, 3000)
    document.getElementById('main_menu').classList.remove('visible');
    document.getElementById('in_game').classList.add('visible');
    resetGame()
}

function showMenu(){
    currentLane = 2;
    document.getElementById('start_game').addEventListener('click', startGame);
    document.getElementById('in_game').classList.remove('visible');
    document.getElementById('main_menu').classList.add('visible');
    paused = true;
    gameOver = false;
}

document.getElementById("version").innerText = version;
document.getElementById("continue").addEventListener('touchend', createAudio, {once:true})
document.getElementById("continue").addEventListener('click', createAudio, {once: true})