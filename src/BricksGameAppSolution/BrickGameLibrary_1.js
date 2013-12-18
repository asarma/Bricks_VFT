/* global x:true y:true dx:true dy:true ctx d ballr paddleh paddlex:true paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 


//Task #2 - V3 (incorrect variation)
/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 05-03-2013               *
* @Description: Added the stroke() method     *
* *********************************************/

//*********************************************
//Action: shape3
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.8 * Math.PI/3, 1.4 * Math.PI, false);
   ctx.fillStyle='rgba(0, 0, 0, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   
   
   
//Task #1 - V5 (incorrect variation)
/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 09-15-2013               *
* @Description: Added the fill() method       *                            
* *********************************************/

//*********************************************
//Action: paddle5
//*********************************************

   ctx.beginPath();  
   polygon(ctx,paddlex+10,HEIGHT-30 - paddleh-15,paddlew-15,5,Math.PI/2);
   ctx.closePath();
   ctx.fillStyle="rgba(227,11,43,0.75)";
   ctx.fill();
   ctx.stroke();   
   



//Task #2 - V7 (incorrect variant)
/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 04-04-2013               *
* @Description: Added the bricks() method     *
* *********************************************/

//*********************************************
//Action: bounce1
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
 //move the ball vertically
  if (x + dx + ballr < WIDTH || x + dx - ballr > 0)
    dx = -dx;
//moves vertically sing (>)
  if (y + dy - ballr < 0)
  dy = -dy;

  else if (y + dy + ballr > HEIGHT - paddleh) 
  {
    if (x > paddlex && x < paddlex + paddlew)
    {
      //move the ball differently based on where it hit the paddle
      dx = 8 * ((x-(paddlex+paddlew/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
     clearInterval(intervalId);
  }
 x += dx;
 y += dy;
   
   