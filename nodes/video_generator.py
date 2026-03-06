"""Video Generator Node - Generates videos from outfit designs."""

import asyncio
import json
import os
import time
import traceback
from typing import Dict, Any

from fashion_agent.config import file_logger, console_logger
from fashion_agent.state import VideoGenerationCollectionOutput, VideoGenerationOutput
from fashion_agent.tools.helpers import make_video


async def video_generator_node(state: Dict[str, Any], config) -> Dict[str, Any]:
    """LangGraph node for video generation - runs after outfit designer."""
    
    # CACHE DISABLED - Always run agent fresh
    # def load_cached_output():
    #     """Check if cached video generation output exists."""
    #     output_file = "data/video_generation_collection_output.json"
    #     if os.path.exists(output_file):
    #         try:
    #             with open(output_file, "r") as f:
    #                 structured_output = VideoGenerationCollectionOutput(**json.load(f))
    #             
    #             file_logger.info("Loaded Video Generation output from file, skipping agent execution.")
    #             
    #             return {
    #                 "outfit_videos": [structured_output.model_dump()],
    #                 "agent_memories": {
    #                     **state.get("agent_memories", {}),
    #                     "video_generator": {
    #                         "videos_generated": structured_output.successful_videos,
    #                         "videos_failed": structured_output.failed_videos,
    #                         "total_processing_time": structured_output.total_processing_time
    #                     }
    #                 },
    #                 "execution_status": {
    #                     **state.get("execution_status", {}),
    #                     "video_generator": "completed"
    #                 }
    #             }
    #         except Exception as e:
    #             file_logger.warning(f"Failed to load cached Video Generation output: {e}. Will rerun agent.")
    #     return None
    
    async def _check_and_archive(result_dict: Dict[str, Any], config):
        """Check if workflow is complete and archive if successful."""
        from ..utils import storage
        
        await asyncio.to_thread(storage.update_video_generation,
                               record_id=f"fashion_analysis_{config['configurable']['thread_id']}",
                               data=result_dict)
        
        execution_status = result_dict.get("execution_status", {})
        required_agents = ["data_collector", "video_analyzer", "content_analyzer", 
                          "final_processor", "outfit_designer", "video_generator"]
        all_completed = all(execution_status.get(agent) == "completed" for agent in required_agents)
        
        file_logger.info(f"Workflow execution status: {execution_status}")
        file_logger.info(f"All agents completed successfully: {all_completed}")
        
        # Note: To access historical state/outputs, use graph.get_state_history(thread_id)
        # LangGraph checkpointer already persists all state at every superstep
        if all_completed:
            file_logger.info("Workflow completed successfully!")
        else:
            file_logger.warning("Workflow did not complete successfully")
            failed_agents = [agent for agent in required_agents if execution_status.get(agent) != "completed"]
            file_logger.warning(f"Failed/incomplete agents: {failed_agents}")
    
    # CACHE DISABLED - Always run agent fresh
    # cached = load_cached_output()
    # if cached:
    #     from ..utils import storage
    #     await asyncio.to_thread(
    #         storage.update_video_generation,
    #         record_id=f"fashion_analysis_{config['configurable']['thread_id']}",
    #         data=cached
    #     )
    #     
    #     # Check if workflow is complete
    #     await _check_and_archive(cached, config)
    #     
    #     return cached
    
    console_logger.info("Starting Video Generator Agent...")
    
    try:
        # Get outfit designs from JSON output explicitly as requested
        # The JSON contains the updated saved_image_path with Supabase URLs
        outfits_json_path = "data/outfit_designer_output.json"
        
        # Default to state if reading fails
        outfit_designs = state.get("outfit_designs", [])
        
        try:
            if os.path.exists(outfits_json_path):
                file_logger.info(f"Loading outfit designs explicitly from {outfits_json_path}")
                with open(outfits_json_path, "r", encoding="utf-8") as f:
                    file_data = json.load(f)
                    # state format expects a list of design collections
                    outfit_designs = [file_data]
            else:
                file_logger.warning(f"Could not find {outfits_json_path}, falling back to state")
        except Exception as e:
            file_logger.error(f"Error reading JSON output: {e}, falling back to state")
        
        if not outfit_designs:
            file_logger.warning("No outfit designs found for video generation")
            return {
                "outfit_videos": [],
                "errors": {**state.get("errors", {}), "video_generator": "No outfit designs available"},
                "execution_status": {
                    **state.get("execution_status", {}),
                    "video_generator": "skipped"
                }
            }
        
        video_results = []
        total_processing_time = 0.0
        successful_videos = 0
        failed_videos = 0
        
        # Get selected outfit IDs from the review decision
        # If empty, generate videos for all outfits (approved means all)
        outfit_review_decision = state.get("outfit_review_decision", {})
        selected_outfit_ids = outfit_review_decision.get("selected_outfit_ids", [])
        
        if selected_outfit_ids:
            file_logger.info(f"Filtering videos for selected outfits only: {selected_outfit_ids}")
        else:
            file_logger.info("No specific outfits selected - generating videos for ALL approved outfits")
        
        # Process each outfit design collection
        for design_collection in outfit_designs:
            if isinstance(design_collection, dict):
                # Handle ListofOutfits structure - check for both 'outfits' and 'Outfits'
                outfits_list = design_collection.get('Outfits') or design_collection.get('outfits', [])
                console_logger.info(f"Processing {len(outfits_list)} outfits for video generation")
                
                if not outfits_list:
                    # Single outfit structure
                    outfits_list = [design_collection]
                
                for outfit in outfits_list:
                    outfit_dict = outfit if isinstance(outfit, dict) else {}
                    
                    # Get outfit ID/name for filtering
                    outfit_id = (
                        outfit_dict.get('outfit_name') or
                        outfit_dict.get('outfit_id') or
                        outfit_dict.get('id') or
                        outfit_dict.get('name') or
                        f"outfit_{len(video_results) + 1}"
                    )
                    
                    # FILTER: Skip outfits not in selected list (if any selected)
                    if selected_outfit_ids and outfit_id not in selected_outfit_ids:
                        file_logger.info(f"Skipping outfit '{outfit_id}' - not in selected list")
                        continue
                    
                    # Extract image path from outfit
                    image_path = (
                        outfit_dict.get('saved_image_path') or 
                        outfit_dict.get('image_path') or
                        outfit_dict.get('output_image_path')
                    )
                    print("----------------------------------", outfit_dict)
                    # FIX: Only prepend local path if it's a relative local path (not a URL)
                    if image_path:
                        if image_path.startswith(('http://', 'https://')):
                            # It's a URL (e.g., Supabase), use as-is
                            file_logger.info(f"Using remote URL for outfit {outfit_id}: {image_path}")
                        elif not os.path.isabs(image_path):
                            # Relative local path - prepend base directory
                            image_path = os.path.join("D:/Downloads/FashionUseCase/scraapper/", image_path)
                    
                    if not image_path:
                        file_logger.warning(f"No image path found for outfit: {outfit_id}")
                        failed_videos += 1
                        continue
                    
                    console_logger.info(f"Generating video for outfit: {outfit_id}")
                    
                    # Call make_video function
                    start_time = time.time()
                    video_result = await make_video(image_path)
                    end_time = time.time()
                    
                    processing_time = end_time - start_time
                    total_processing_time += processing_time
                    
                    # Upload video to Supabase and get public URL
                    video_url = ''
                    if video_result.get('success') and video_result.get('output_path'):
                        try:
                            from ..utils import storage
                            local_video_path = video_result.get('output_path')
                            video_url = await asyncio.to_thread(
                                storage.upload_video_to_supabase, 
                                local_video_path
                            )
                            if video_url:
                                file_logger.info(f"Video uploaded to Supabase: {video_url}")
                            else:
                                file_logger.warning(f"Failed to upload video to Supabase, using local path")
                                video_url = local_video_path
                        except Exception as e:
                            file_logger.warning(f"Error uploading video to Supabase: {e}, using local path")
                            video_url = video_result.get('output_path', '')
                    
                    # Create video generation result with Supabase URL
                    video_output = VideoGenerationOutput(
                        outfit_id=outfit_id,
                        input_image_path=image_path,
                        output_video_path=video_url,  # Now stores Supabase URL instead of local path
                        generation_success=video_result.get('success', False),
                        generation_time=processing_time,
                        error_message=video_result.get('error') or '',
                        video_duration=video_result.get('duration', 0.0),
                        video_format="mp4"
                    )
                    
                    video_results.append(video_output.model_dump())
                    
                    if video_result.get('success'):
                        successful_videos += 1
                        file_logger.info(f"SUCCESS: Video generated for {outfit_id}: {video_result.get('output_path')}")
                    else:
                        failed_videos += 1
                        file_logger.error(f"FAILED: Video generation for {outfit_id}: {video_result.get('error')}")
        
        # Create collection output - count only processed outfits (after filtering)
        total_outfits_processed = successful_videos + failed_videos
        
        collection_output = VideoGenerationCollectionOutput(
            total_outfits_processed=total_outfits_processed,
            successful_videos=successful_videos,
            failed_videos=failed_videos,
            video_results=[VideoGenerationOutput(**result) for result in video_results],
            total_processing_time=total_processing_time,
            output_directory="videos/"
        )
        
        # Log raw output
        file_logger.info("="*80)
        file_logger.info("VIDEO GENERATOR RAW OUTPUT:")
        file_logger.info(json.dumps(collection_output.model_dump(), indent=2))
        file_logger.info("="*80)
        
        # Persist collection output to disk
        await asyncio.to_thread(
            lambda: json.dump(collection_output.model_dump(), 
                            open("data/video_generation_collection_output.json", "w"), 
                            indent=4)
        )
        
        # Upload metadata and video files to Supabase
        from ..utils import storage
        record_id = f"fashion_analysis_{config['configurable']['thread_id']}"
        
        # Update DB with the video generation metadata
        try:
            await asyncio.to_thread(storage.update_video_generation,
                                  record_id=record_id,
                                  data=collection_output.model_dump())
        except Exception as e:
            file_logger.warning(f"Failed to update video_generation metadata in DB: {e}")
        
        # Build full paths for each generated video and upload them to storage
        try:
            video_file_paths = []
            for v in collection_output.video_results:
                out_path = getattr(v, 'output_video_path', None) if hasattr(v, 'output_video_path') else (
                    v.get('output_video_path') if isinstance(v, dict) else None
                )
                if not out_path:
                    continue
                
                # Normalize and make absolute if relative
                if not await asyncio.to_thread(os.path.isabs, out_path):
                    full_path = await asyncio.to_thread(
                        lambda p=out_path: os.path.normpath(os.path.join(os.getcwd(), p))
                    )
                else:
                    full_path = await asyncio.to_thread(os.path.normpath, out_path)
                video_file_paths.append(full_path)
            
            if video_file_paths:
                await asyncio.to_thread(storage.update_videos,
                                      record_id=record_id,
                                      video_paths=video_file_paths,
                                      append=True)
        except Exception as e:
            file_logger.warning(f"Failed to upload/update video files in DB: {e}")
        
        file_logger.info(f"Video generation completed: {successful_videos} success, {failed_videos} failed")
        
        # Build result dictionary
        result_dict = {
            "outfit_videos": [collection_output.model_dump()],
            "agent_memories": {
                **state.get("agent_memories", {}),
                "video_generator": {
                    "videos_generated": successful_videos,
                    "videos_failed": failed_videos,
                    "total_processing_time": total_processing_time
                }
            },
            "execution_status": {
                **state.get("execution_status", {}),
                "video_generator": "completed"
            }
        }
        
        # Check if workflow is complete and archive if successful
        await _check_and_archive(result_dict, config)
        
        return result_dict
        
    except Exception as e:
        file_logger.error(f"ERROR: Video Generator error: {e}")
        file_logger.error(f"Video generator traceback: {traceback.format_exc()}")
        return {
            "outfit_videos": [],
            "errors": {**state.get("errors", {}), "video_generator": str(e)},
            "execution_status": {
                **state.get("execution_status", {}),
                "video_generator": "failed"
            }
        }
