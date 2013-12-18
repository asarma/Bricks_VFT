/*global draw rect rowcolors ballr*/ 


//variable declarations
var x = 25;
var y = 250;
var dx = 1.5;
var dy = -4;
var d = 20; 
var ctx;
var WIDTH;
var HEIGHT;

//paddle dimensions
var paddlex;
var paddleh = 10; 
var paddlew = 75; 

//canvas dimensions
var rightDown = false;
var leftDown = false;
var canvasMinX = 0;
var canvasMaxX = 0;
var intervalId = 0;

//bricks dimensions
var bricks;
var NROWS = 10;
var NCOLS = 10;
var BRICKWIDTH;
var BRICKHEIGHT = 12;
var PADDING = 3;

//function init() starts the bricks game
function init() {
  ctx = $('#canvas')[0].getContext("2d");
  WIDTH = $("#canvas").width();
  HEIGHT = $("#canvas").height();
  paddlex = WIDTH / 2;
  BRICKWIDTH = (WIDTH/NCOLS) - 1;
  canvasMinX = $("#canvas").offset().left;
  canvasMaxX = canvasMinX + WIDTH;
  intervalId = setInterval(draw, 10);
}


//function draws the bricks
function rect(x,y,w,h) {
  ctx.beginPath();
  ctx.rect(x,y,w,h);
  ctx.closePath();
  ctx.fill();
}


//---------------------------TASK 1 - START ----------------------//
 
 /****************************************
 * Task #1 - (perfect variant)           *
 * Action Selected - paddle3             *
 * Author Selected - Smith               *
 * Variant Selected - V3                 *
 * File Selected - BrickGameLibrary_6.js *
 * ***************************************/
 
 //function drawPaddle() draws the paddle
 function drawPaddle() {
    var x = paddlex;
    var y = HEIGHT - paddleh;
 
    ctx.beginPath();  
    ctx.rect(x-30, y, paddlew+30, paddleh+40);
    ctx.closePath();
    ctx.fillStyle="rgba(127,11,93,0.75)";
    ctx.fill();
    ctx.stroke();
    



}
//---------------------------TASK 1 - END ----------------------//



//this function displays the bricks on the canvas with dimensions 10x10
function drawBricks() {
  for (var i=0; i < NROWS; i++) {
    ctx.fillStyle = rowcolors[i];
   for (var j=0; j < NCOLS; j++) {
      if (bricks[i][j] == 1) {
       rect((j * (BRICKWIDTH + PADDING)) + PADDING,
             (i * (BRICKHEIGHT + PADDING)) + PADDING,
             BRICKWIDTH, BRICKHEIGHT);
      }
    }
  }
}

//function clear() refreshes the screen
function clear() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  rect(0,0,WIDTH,HEIGHT);
}


/*
 * function onKeyDown() allows users using keystroke 
 * s down indestad of using mouse as alternative
 */
function onKeyDown(evt) {
  if (evt.keyCode == 39) rightDown = true;
  else if (evt.keyCode == 37) leftDown = true;
}


/*
 * function onKeyUp() allows users using keystrok
 * es up indestad of using mouse as alternative
 */
function onKeyUp(evt) {
  if (evt.keyCode == 39) rightDown = false;
  else if (evt.keyCode == 37) leftDown = false;
}


$(document).keydown(onKeyDown);
$(document).keyup(onKeyUp);


//function onKeyMove() allows users using mouse operations
function onMouseMove(evt) {
  if (evt.pageX > canvasMinX && evt.pageX < canvasMaxX) {  
    paddlex = Math.max(evt.pageX - canvasMinX - (paddlew/2),   0);
    paddlex = Math.min(WIDTH - paddlew, paddlex);
  }
}

$(document).mousemove(onMouseMove);



//----------------------------------------TASK 2 - START ------------------------------------//

 /*********************************************************************************************
 * Task #2 - (imperfect variant)     `                                                        *
 * ********************************************************************************************
 * Actions Selected  - bounce2,     shape9,      shape4                                       *
 * Variants Selected -    V6,         V10,          V4                                         *
 * Authors Selected  - Johnson,      Smith,      Donovan                                      *  
 * Files Selected    - BrickGameLibrary_10.js, BrickGameLibrary_12.js, BrickGameLibrary_3.js  * 
 * ********************************************************************************************/

//The function drawBouncingBall does two things: it first 
//draws the ball and then applies the bouncing feature
function drawBouncingBall(){

//BrickGameLibrary_3.js-> shape4 -> V4
ctx.beginPath();  
ctx.arc(x, y, (d/2), 0, Math.PI*2, false); 
ctx.fillStyle="rgba(127,11,93,0.75)";
ctx.closePath();
ctx.fill();
ctx.stroke();

//BrickGameLibrary_12.js -> shape9 -> V10
ctx.beginPath();  
ctx.arc(x, y, d, 1.1 * Math.PI, 1.9 * Math.PI, false);
ctx.fillStyle='rgba(0, 0, 0, 1)';
ctx.closePath();
ctx.fill();
ctx.stroke();

//BrickGameLibrary_10.js -> bounce2 -> V6
var rowheight = BRICKHEIGHT + PADDING;
var colwidth = BRICKWIDTH + PADDING;
var row = Math.floor(y/rowheight);
var col = Math.floor(x/colwidth);
  
 //reverse the ball and mark the brick as broken
  if (y < NROWS * rowheight && row >= 0 && col >= 0 && bricks[row][col] == 1) {
    dy = -dy;
    bricks[row][col] = 0;
  }
 
  if (x + dx + ballr > WIDTH || x + dx - ballr < 0)
    dx = -dx;

  if (y + dy - ballr < 0)
    dy = -dy;
  else if (y + dy + ballr > HEIGHT-40 - paddleh+40) 
  {
    if (x+30 > paddlex && x < paddlex + paddlew+30) 
    {
      //move the ball differently based on where it hit the paddle
      dx = 8 * (((x+30)-(paddlex+paddlew/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
      clearInterval(intervalId);
  }
 x += dx;
 y += dy;

}
//----------------------------------------TASK 2 - End --------------------------------------//




//function polygon draws different shapes
function polygon(ctx, x, y, radius, sides, startAngle, anticlockwise) {
  if (sides < 3) return;
  var a = (Math.PI * 2)/sides;
  a = anticlockwise?-a:a;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(startAngle);
  ctx.moveTo(radius,0);
  for (var i = 1; i < sides; i++) {
    ctx.lineTo(radius*Math.cos(a*i),radius*Math.sin(a*i));
  }
  ctx.closePath();
  ctx.restore();
}
     
     
//function initbricks() puts bricks 10x10 in the canvas
function initbricks() {
    bricks = new Array(NROWS);
    for (var i=0; i < NROWS; i++) {
        bricks[i] = new Array(NCOLS);
        for (var j=0; j < NCOLS; j++) {
            bricks[i][j] = 1;
        }
    }
}



