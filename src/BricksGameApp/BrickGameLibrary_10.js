/* global onMouseMove x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 



/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 03-11-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: paddle
//*********************************************

   ctx.beginPath();  
   polygon(ctx,paddlex,HEIGHT-40 - paddleh,paddlew-5,4,Math.PI/4);
   ctx.closePath();
   ctx.fillStyle="rgba(227,341,43,0.75)";
   ctx.fill();
   ctx.stroke();



/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 21-05-2013               *
* @Description: Added the closePath() method  *
* *********************************************/

//*********************************************
//Action: shape
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.8 * Math.PI/3, 1.4 * Math.PI, false);
   ctx.fillStyle='rgba(0, 0, 0, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   
   

/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 21-05-2013               *
* @Description: Changed the definition for dx *
* *********************************************/

//*********************************************
//Action: bounce
//*********************************************

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

