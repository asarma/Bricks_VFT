/* global x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 

//Task #1 - V6 (incorrect variant)
/**********************************************
* @Author:Smith                               *    
* @Last-Update-Date: 25-07-2013               *
* @Description: changed the arc to polygon    *
* *********************************************/

//*********************************************
//Action: paddle6
//*********************************************

   ctx.beginPath();  
   polygon(ctx,paddlex,HEIGHT - paddleh,paddlew,3,Math.PI/2);
   ctx.closePath();
   ctx.fillStyle="rgba(147,41,43,0.75)";
   ctx.fill();
   ctx.stroke();
   
   
   
//Task #2 - V1 (incorrect variation)
/**********************************************
* @Author:Smith                               *
* @Last-Update-Date: 1-1-2013                 *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: shape1
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d/4, 0, Math.PI*2, false); 
   ctx.fillStyle="rgba(127,11,193,0.85)";
   ctx.closePath();
   ctx.fill();
   ctx.stroke();



//Task #2 - V5 (incorrect variant)
/***********************************************
* @Author:Donovan                              *
* @Last-Update-Date: 1-02-2013                 *
* @Description: Added the clearInterval method *
* **********************************************/

//*********************************************
//Action: bounce5 - V5
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
  //moves vertically sing (>)
  if (y + dy - ballr > 0)
    dy = -dy;
  else if (y + dy + ballr > HEIGHT - paddleh) 
  {
    if (x > paddlex && x < paddlex + paddlew) 
    {
      //move the ball differently based on where it hit the paddle
      dx = -dy * ((x-(paddlex+paddlew/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
     clearInterval(intervalId);
  }
 x += dx;
 y += dy;      