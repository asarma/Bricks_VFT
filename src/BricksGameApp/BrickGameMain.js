/*global ctx x:true y:true circle drawPaddle drawBricks drawBouncingBall arc
  dx:true dy:true WIDTH HEIGHT paddlex:true paddleh paddlew rightDown leftDown canvasMinX canvasMaxX
  intervalId bricks NROWS NCOLS BRICKWIDTH BRICKHEIGHT PADDING clear rect init initbricks 
*/


var ballr            = 10;
var rowcolors        = ["#DF0101","#DF0101","#FF9900","#FF9900","#FFFD0A","#FFFD0A", "#33FF11", "#33FF11", "#00FFFF", "#00FFFF"];
var paddle_color     = '#000000'; 
var ball_color       = "#000000";     
var background_color = "#FFFFFF" 


//this functionallity draws the entire game
function draw() {
  ctx.fillStyle = background_color;
  clear();
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  rect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle = ball_color;
  

 //this functional call creates the ball and moves on different directions
   drawBouncingBall();          

  if(rightDown) paddlex += 5;
    else if (leftDown) paddlex -= 5;
  ctx.fillStyle = paddle_color;
  
 //this function call creates the paddle
  drawPaddle();              


  //this function call draws the bricks
  drawBricks();

 
}

