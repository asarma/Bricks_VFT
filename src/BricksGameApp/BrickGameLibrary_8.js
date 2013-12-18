/* global x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 



/**********************************************
* @Author:Smith                               *
* @Last-Update-Date: 11-15-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: paddle
//*********************************************

   ctx.beginPath();  
   polygon(ctx,paddlex+50,HEIGHT - paddleh+52,paddlew,4,Math.PI/4);
   ctx.closePath();
   ctx.fillStyle="rgba(237,11,93,0.95)";
   ctx.fill();
   ctx.stroke();



/**********************************************
* @Author:Smith                               *
* @Last-Update-Date: 11-15-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: shape
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.1 * Math.PI, 1.9 * Math.PI, false);
   ctx.fillStyle='rgba(10, 100, 100, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();




/***********************************************
* @Author:Smith                                *
* @Last-Update-Date: 1-1-2013                  *
* @Description: Added the clearInterval method *
* **********************************************/

//*********************************************
//Action: bounce
//*********************************************
 
  //collison detection
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

  if (y + dy - ballr > 0)
    dy = -dy;
  else if (y + dy + ballr > HEIGHT - paddleh) 
  {
    if (x > paddlex && x < paddlex + paddlew) 
    {
      //move the ball differently based on where it hit the paddle
      dx = 8 * (((x+y)/2-(paddlex+paddlew/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
     clearInterval(intervalId);
  }
 x += dx;
 y += dy;